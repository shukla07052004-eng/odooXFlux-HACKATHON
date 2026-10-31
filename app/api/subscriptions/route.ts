import { randomInt } from "node:crypto";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const select = `SELECT s.id,s.subscription_number,s.customer_id,u.name AS customer_name,s.plan_id,p.name AS plan_name,p.price AS plan_price,p.billing_interval,
  s.start_date,s.expiry_date,s.next_billing_date,s.payment_terms,s.subtotal,s.tax_amount,s.total_amount,s.status,s.created_at
  FROM subscriptions s LEFT JOIN users u ON u.id=s.customer_id LEFT JOIN plans p ON p.id=s.plan_id`;
const createSchema = z.object({ subscription_number:z.string().max(50).optional(),customer_id:z.string().uuid(),plan_id:z.string().uuid(),start_date:z.string().date(),expiry_date:z.string().date().optional().or(z.literal("")),payment_terms:z.string().max(40).optional(),quantity:z.coerce.number().positive(),billing_item_ids:z.union([z.array(z.string().uuid()),z.string()]).optional() });

export async function GET(request: Request) {
  const auth = await requireApiUser(request); if (!auth.user) return auth.response;
  try {
    await pool.query(`UPDATE subscriptions s SET status='closed' FROM plans p WHERE p.id=s.plan_id AND p.auto_close=TRUE AND s.status IN ('active','paused') AND s.expiry_date<CURRENT_DATE`);
    const search = new URL(request.url).searchParams;
    const page = Math.max(1,Number(search.get("page") || 1));
    const pageSize = Math.min(100,Math.max(1,Number(search.get("pageSize") || 50)));
    const scope = auth.user.role === "customer" ? "s.customer_id=$1" : auth.user.role === "staff" ? "u.assigned_staff_id=$1" : "";
    const params: unknown[] = scope ? [auth.user.id] : [];
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM subscriptions s JOIN users u ON u.id=s.customer_id ${scope ? `WHERE ${scope}` : ""}`,params);
    const result = await pool.query(`${select}${scope ? ` WHERE ${scope}` : ""} ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,[...params,pageSize,(page-1)*pageSize]);
    return Response.json({ data:result.rows,pagination:{page,pageSize,total:count.rows[0].total,totalPages:Math.max(1,Math.ceil(count.rows[0].total/pageSize))} });
  } catch (error) { return authErrorResponse(error,"subscriptions:list"); }
}

export async function POST(request: Request) {
  const auth=await requireApiUser(request,["admin","staff"]);if(!auth.user)return auth.response;
  let body:unknown;try{body=await request.json();}catch{return validationError("Subscription details are invalid.");}
  const parsed=createSchema.safeParse(body);if(!parsed.success)return validationError(parsed.error.issues[0]?.message??"Subscription details are invalid.");
  const value=parsed.data;
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const customer=await client.query("SELECT id FROM users WHERE id=$1 AND role='customer' AND ($2::text='admin' OR assigned_staff_id=$3) FOR KEY SHARE",[value.customer_id,auth.user.role,auth.user.id]);
    if(!customer.rows[0]){await client.query("ROLLBACK");return validationError("Customer not found or outside your assigned customers.",403);}
    const plan=await client.query("SELECT id,name,price,billing_interval,min_quantity,start_date,end_date FROM plans WHERE id=$1 FOR KEY SHARE",[value.plan_id]);
    if(!plan.rows[0]){await client.query("ROLLBACK");return validationError("Plan not found.",404);}
    if(value.quantity<Number(plan.rows[0].min_quantity)){await client.query("ROLLBACK");return validationError(`Quantity must be at least ${plan.rows[0].min_quantity}.`,400);}
    if(plan.rows[0].start_date&&value.start_date<String(plan.rows[0].start_date).slice(0,10)){await client.query("ROLLBACK");return validationError("The selected plan is not available yet.",400);}
    if(plan.rows[0].end_date&&value.start_date>String(plan.rows[0].end_date).slice(0,10)){await client.query("ROLLBACK");return validationError("The selected plan is no longer available.",400);}
    const rate=await client.query("SELECT rate FROM taxes WHERE is_active=TRUE AND is_default=TRUE LIMIT 1");
    const taxRate=Number(rate.rows[0]?.rate??0);
    const unitPrice=Number(plan.rows[0].price);
    let subtotal=unitPrice*value.quantity;
    let tax=(subtotal*taxRate)/100;
    const billingItemIds=(Array.isArray(value.billing_item_ids)?value.billing_item_ids:String(value.billing_item_ids??"").split(",")).filter(Boolean);
    const productItems:Array<{product_id:string;variant_id:string|null;description:string;quantity:number;unit_price:number;tax_rate:number}> = [];
    for(const itemId of [...new Set(billingItemIds)]) {
      const item=await client.query(`SELECT p.id,p.name,p.sales_price,COALESCE(v.variant_name,'') AS variant_name,v.id AS variant_id,COALESCE(v.additional_price,0)::numeric AS additional_price,COALESCE(t.rate,$3,0)::numeric AS tax_rate FROM plan_products pp JOIN products p ON p.id=pp.product_id LEFT JOIN product_variants v ON v.product_id=p.id AND v.id=$2 LEFT JOIN taxes t ON t.id=p.tax_id AND t.is_active=TRUE WHERE pp.plan_id=$1 AND (p.id=$2 OR v.id=$2)`,[value.plan_id,itemId,taxRate]);
      if(!item.rows[0]){await client.query("ROLLBACK");return validationError("Selected product or variant is not associated with this plan.",400);}
      const linePrice=Number(item.rows[0].sales_price)+Number(item.rows[0].additional_price);
      const lineTax=Number(item.rows[0].tax_rate);
      subtotal+=linePrice*value.quantity;
      tax+=linePrice*value.quantity*lineTax/100;
      productItems.push({product_id:item.rows[0].id,variant_id:item.rows[0].variant_id,description:`${item.rows[0].name}${item.rows[0].variant_name?` · ${item.rows[0].variant_name}`:""}`,quantity:value.quantity,unit_price:linePrice,tax_rate:lineTax});
    }
    const total=subtotal+tax;
    const number=value.subscription_number||`BL-SUB-${new Date().getFullYear()}-${randomInt(100000,1000000)}`;
    const inserted=await client.query(`INSERT INTO subscriptions(subscription_number,customer_id,plan_id,start_date,expiry_date,next_billing_date,payment_terms,status,subtotal,tax_amount,total_amount) VALUES($1,$2,$3,$4,$5,$4,$6,'draft',$7,$8,$9) RETURNING id`,[number,value.customer_id,value.plan_id,value.start_date,value.expiry_date||null,value.payment_terms||"Due on receipt",subtotal,tax,total]);
    await client.query("INSERT INTO subscription_items(subscription_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,`Plan: ${plan.rows[0].name}`,value.quantity,unitPrice,taxRate]);
    for(const item of productItems) await client.query("INSERT INTO subscription_items(subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5,$6,$7)",[inserted.rows[0].id,item.product_id,item.variant_id,item.description,item.quantity,item.unit_price,item.tax_rate]);
    await client.query("COMMIT");
    return Response.json({success:true,id:inserted.rows[0].id,subscription_number:number,total_amount:total},{status:201});
  } catch(error){await client.query("ROLLBACK").catch(()=>undefined);if(typeof error==="object"&&error!==null&&"code"in error&&error.code==="23505")return validationError("Subscription number already exists.",409);return authErrorResponse(error,"subscriptions:create");} finally{client.release();}
}
