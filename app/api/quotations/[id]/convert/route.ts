import { randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quote = await client.query(
      `SELECT q.* FROM quotations q JOIN users u ON u.id=q.customer_id
        WHERE q.id=$1 AND ($2::text='admin' OR u.assigned_staff_id=$3) FOR UPDATE OF q`,
      [id,auth.user.role,auth.user.id],
    );
    if (!quote.rows[0]) { await client.query("ROLLBACK"); return validationError("Quotation not found or outside your assigned customers.", 404); }
    if (quote.rows[0].status !== "accepted") { await client.query("ROLLBACK"); return validationError("Only accepted quotations can be converted.", 409); }
    if (new Date(`${quote.rows[0].valid_until}T23:59:59Z`).getTime() < Date.now()) { await client.query("ROLLBACK"); return validationError("This quotation has expired.", 409); }
    const items = await client.query("SELECT * FROM quotation_items WHERE quotation_id=$1 ORDER BY id", [id]);
    if (!items.rows.length) { await client.query("ROLLBACK"); return validationError("Quotation does not contain any items.", 409); }
    const startDate = new Date().toISOString().slice(0, 10);
    const number = `BL-SUB-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
    const setting = await client.query("SELECT setting_value->>'payment_terms' AS payment_terms FROM workspace_settings WHERE setting_key='workspace'");
    const terms = setting.rows[0]?.payment_terms || "Due on receipt";
    const inserted = await client.query(
      `INSERT INTO subscriptions(subscription_number,customer_id,plan_id,start_date,expiry_date,next_billing_date,payment_terms,status,subtotal,tax_amount,total_amount)
       VALUES($1,$2,$3,$4,NULL,$4,$5,'confirmed',$6,$7,$8) RETURNING id`,
      [number,quote.rows[0].customer_id,quote.rows[0].plan_id,startDate,terms,quote.rows[0].subtotal,quote.rows[0].tax_amount,quote.rows[0].total_amount],
    );
    for (const item of items.rows) {
      await client.query("INSERT INTO subscription_items(subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5,$6,$7)", [inserted.rows[0].id,item.product_id,item.variant_id,item.description,item.quantity,item.unit_price,item.tax_rate]);
    }
    await client.query("UPDATE quotations SET status='converted' WHERE id=$1", [id]);
    await client.query("COMMIT");
    return Response.json({ success: true, subscription_id: inserted.rows[0].id, subscription_number: number, status: "confirmed" }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "quotations:convert");
  } finally { client.release(); }
}
