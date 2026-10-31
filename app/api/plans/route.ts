import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const uuidList = z.array(z.string().uuid()).optional();
const schema = z.object({ name: z.string().trim().min(1).max(150), billing_interval: z.enum(["Daily", "Weekly", "Monthly", "Yearly", "daily", "weekly", "monthly", "yearly"]), minimum_quantity: z.coerce.number().int().positive(), availability_start: z.string().date().optional().or(z.literal("")), availability_end: z.string().date().optional().or(z.literal("")), auto_close: z.string().optional(), allow_pause: z.string().optional(), allow_renewal: z.string().optional(), products: uuidList });
const select = `SELECT p.id,p.name,p.billing_interval,p.min_quantity AS minimum_quantity,p.start_date AS availability_start,p.end_date AS availability_end,
  CASE WHEN p.auto_close THEN 'Enabled' ELSE 'Disabled' END AS auto_close,
  CASE WHEN p.allow_pause THEN 'Yes' ELSE 'No' END AS allow_pause,
  CASE WHEN p.allow_renewal THEN 'Yes' ELSE 'No' END AS allow_renewal,
  'Active'::text AS status,COALESCE(array_agg(pp.product_id) FILTER (WHERE pp.product_id IS NOT NULL),'{}') AS products,p.created_at
  FROM plans p LEFT JOIN plan_products pp ON pp.plan_id=p.id`;
function bool(value: string | undefined, affirmative: string) { return value === affirmative || value?.toLowerCase() === "true"; }

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  try { const result = await pool.query(`${select} GROUP BY p.id ORDER BY p.created_at DESC`); return Response.json({ data: result.rows }); }
  catch (error) { return authErrorResponse(error, "plans:list"); }
}
export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Plan details are invalid.");
  const value = parsed.data; const client = await pool.connect();
  try { await client.query("BEGIN"); const inserted = await client.query("INSERT INTO plans(name,billing_interval,min_quantity,start_date,end_date,auto_close,allow_pause,allow_renewal) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [value.name, value.billing_interval.toLowerCase(), value.minimum_quantity, value.availability_start || null, value.availability_end || null, bool(value.auto_close,"Enabled"), bool(value.allow_pause,"Yes"), bool(value.allow_renewal,"Yes")]); for (const productId of value.products ?? []) await client.query("INSERT INTO plan_products(plan_id,product_id) VALUES($1,$2)", [inserted.rows[0].id, productId]); await client.query("COMMIT"); return Response.json({ success: true, id: inserted.rows[0].id }, { status: 201 }); }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); return authErrorResponse(error, "plans:create"); } finally { client.release(); }
}
