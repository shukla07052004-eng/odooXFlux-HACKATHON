import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";
const schema=z.object({invoice_id:z.string().uuid(),payment_method:z.enum(["Cash","Bank Transfer","UPI","Card"]),amount:z.coerce.number().positive(),payment_date:z.string().date(),notes:z.string().max(2000).optional()});
export async function GET(request:Request){
  const auth=await requireApiUser(request);if(!auth.user)return auth.response;
  const search=new URL(request.url).searchParams;
  const parsed=z.object({from:z.string().date().optional(),to:z.string().date().optional(),page:z.coerce.number().int().positive().default(1),pageSize:z.coerce.number().int().positive().max(100).default(50)}).safeParse({from:search.get("from")||undefined,to:search.get("to")||undefined,page:search.get("page")||undefined,pageSize:search.get("pageSize")||undefined});
  if(!parsed.success)return validationError("Choose valid payment filters.");
  try{
    const conditions:string[]=[];const values:unknown[]=[];
    if(auth.user.role==="customer"){values.push(auth.user.id);conditions.push(`i.customer_id=$${values.length}`);}
    if(auth.user.role==="staff"){values.push(auth.user.id);conditions.push(`u.assigned_staff_id=$${values.length}`);}
    if(parsed.data.from){values.push(parsed.data.from);conditions.push(`pay.payment_date >= $${values.length}::date`);}
    if(parsed.data.to){values.push(parsed.data.to);conditions.push(`pay.payment_date < ($${values.length}::date + INTERVAL '1 day')`);}
    const where=conditions.length?`WHERE ${conditions.join(" AND ")}`:"";
    const from=`FROM payments pay LEFT JOIN invoices i ON i.id=pay.invoice_id LEFT JOIN users u ON u.id=i.customer_id ${where}`;
    const count=await pool.query(`SELECT COUNT(*)::int AS total,COALESCE(SUM(pay.amount),0)::numeric AS amount ${from}`,values);
    const page=parsed.data.page,pageSize=parsed.data.pageSize,offset=(page-1)*pageSize;
    const result=await pool.query(`SELECT pay.id,pay.id::text AS payment_number,pay.invoice_id,i.invoice_number,i.customer_id,u.name AS customer_name,pay.amount,pay.payment_method,pay.payment_date,pay.note AS notes,'Recorded'::text AS status ${from} ORDER BY pay.payment_date DESC,pay.id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,pageSize,offset]);
    return Response.json({data:result.rows,summary:{total:count.rows[0].total,amount:count.rows[0].amount},pagination:{page,pageSize,total:count.rows[0].total,totalPages:Math.max(1,Math.ceil(count.rows[0].total/pageSize))}});
  }catch(error){return authErrorResponse(error,"payments:list");}
}
export async function POST(request:Request){const auth=await requireApiUser(request,["admin","staff"]);if(!auth.user)return auth.response;const parsed=schema.safeParse(await request.json());if(!parsed.success)return validationError(parsed.error.issues[0]?.message??"Payment details are invalid.");const v=parsed.data;const client=await pool.connect();try{await client.query("BEGIN");const invoice=await client.query("SELECT i.id,i.customer_id,i.total_amount FROM invoices i JOIN users c ON c.id=i.customer_id WHERE i.id=$1 AND ($2::text='admin' OR c.assigned_staff_id=$3) FOR UPDATE OF i",[v.invoice_id,auth.user.role,auth.user.id]);if(!invoice.rows[0]){await client.query("ROLLBACK");return validationError("Invoice not found or outside your assigned customers.",404);}const paid=await client.query("SELECT COALESCE(SUM(amount),0)::numeric AS paid FROM payments WHERE invoice_id=$1",[v.invoice_id]);const outstanding=Number(invoice.rows[0].total_amount)-Number(paid.rows[0].paid);if(v.amount>outstanding+0.005){await client.query("ROLLBACK");return validationError("Payment exceeds the invoice's outstanding balance.",409);}const inserted=await client.query("INSERT INTO payments(invoice_id,amount,payment_method,payment_date,note) VALUES($1,$2,$3,$4,$5) RETURNING id,invoice_id,amount,payment_method,payment_date,note",[v.invoice_id,v.amount,v.payment_method,v.payment_date,v.notes??null]);const nextPaid=Number(paid.rows[0].paid)+v.amount;await client.query("UPDATE invoices SET status=CASE WHEN $1 >= total_amount THEN 'paid' ELSE 'confirmed' END WHERE id=$2",[nextPaid,v.invoice_id]);await client.query("COMMIT");return Response.json({data:{...inserted.rows[0],notes:inserted.rows[0].note},message:"Payment recorded."},{status:201});}catch(error){await client.query("ROLLBACK").catch(()=>undefined);return authErrorResponse(error,"payments:create");}finally{client.release();}}
