import { randomInt } from "node:crypto";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const select = `SELECT s.id,s.subscription_number,s.customer_id,u.name AS customer_name,s.plan_id,p.name AS plan_name,
  s.start_date,s.expiry_date,s.payment_terms,s.subtotal,s.tax_amount,s.total_amount,s.status,s.created_at
  FROM subscriptions s LEFT JOIN users u ON u.id=s.customer_id LEFT JOIN plans p ON p.id=s.plan_id`;
const createSchema = z.object({ subscription_number: z.string().max(50).optional(), customer_id: z.string().uuid(), plan_id: z.string().uuid(), start_date: z.string().date(), expiry_date: z.string().date().optional().or(z.literal("")), payment_terms: z.string().max(40).optional(), quantity: z.coerce.number().positive(), unit_price: z.coerce.number().nonnegative(), tax_rate: z.coerce.number().min(0).max(100).optional() });

export async function GET(request: Request) {
  const auth = await requireApiUser(request); if (!auth.user) return auth.response;
  try {
    const customerScope = auth.user.role === "customer" ? "s.customer_id=$1" : auth.user.role === "staff" ? "EXISTS(SELECT 1 FROM users c WHERE c.id=s.customer_id AND c.assigned_staff_id=$1)" : "";
    const params = customerScope ? [auth.user.id] : [];
    const result = await pool.query(`${select}${customerScope ? ` WHERE ${customerScope}` : ""} ORDER BY s.created_at DESC`, params);
    return Response.json({ data: result.rows });
  }
  catch (error) { return authErrorResponse(error, "subscriptions:list"); }
}
export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const parsed = createSchema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Subscription details are invalid.");
  const value = parsed.data; const taxRate = value.tax_rate ?? 0; const subtotal = value.quantity * value.unit_price; const tax = subtotal * taxRate / 100; const total = subtotal + tax; const number = value.subscription_number || `BL-SUB-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
  if (auth.user.role === "staff") {
    const assigned = await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='customer' AND assigned_staff_id=$2", [value.customer_id, auth.user.id]);
    if (!assigned.rowCount) return validationError("Customer is not assigned to this staff account.", 403);
  }
  const client = await pool.connect();
  try { await client.query("BEGIN"); const inserted = await client.query(`INSERT INTO subscriptions(subscription_number,customer_id,plan_id,start_date,expiry_date,payment_terms,status,subtotal,tax_amount,total_amount) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9) RETURNING id`, [number,value.customer_id,value.plan_id,value.start_date,value.expiry_date||null,value.payment_terms||"Due on receipt",subtotal,tax,total]); await client.query("INSERT INTO subscription_items(subscription_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5)",[inserted.rows[0].id,"Subscription plan",value.quantity,value.unit_price,taxRate]); await client.query("COMMIT"); return Response.json({ success:true,id:inserted.rows[0].id,subscription_number:number,total_amount:total },{status:201}); }
  catch(error) { await client.query("ROLLBACK").catch(()=>undefined); return authErrorResponse(error,"subscriptions:create"); } finally { client.release(); }
}
