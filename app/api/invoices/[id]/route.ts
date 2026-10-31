import { NextRequest } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const auth = await requireApiUser(request);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const result = await pool.query(
      `SELECT i.id,i.invoice_number,i.customer_id,u.name AS customer_name,i.subscription_id,s.subscription_number,
              i.invoice_date,i.due_date,i.period_start,i.period_end,i.subtotal,i.tax_amount,i.discount_amount,i.total_amount,
              pay.paid_amount,GREATEST(i.total_amount-pay.paid_amount,0)::numeric AS outstanding_amount,
              CASE WHEN i.status IN ('confirmed','sent') AND i.due_date<CURRENT_DATE AND i.total_amount>pay.paid_amount THEN 'overdue' ELSE i.status END AS status,
              items.invoice_items AS items
         FROM invoices i LEFT JOIN users u ON u.id=i.customer_id LEFT JOIN subscriptions s ON s.id=i.subscription_id
         LEFT JOIN LATERAL(SELECT COALESCE(SUM(amount),0)::numeric AS paid_amount FROM payments WHERE invoice_id=i.id) pay ON TRUE
         LEFT JOIN LATERAL(SELECT COALESCE(json_agg(json_build_object('id',ii.id,'description',ii.description,'product_id',ii.product_id,'variant_id',ii.variant_id,'quantity',ii.quantity,'unit_price',ii.unit_price,'tax_rate',ii.tax_rate)),'[]') AS invoice_items FROM invoice_items ii WHERE ii.invoice_id=i.id) items ON TRUE
        WHERE i.id=$1 AND ($2::text='admin' OR ($2::text='customer' AND i.customer_id=$3) OR ($2::text='staff' AND u.assigned_staff_id=$3))`,
      [id,auth.user.role,auth.user.id],
    );
    if (!result.rows[0]) return validationError("Invoice not found.", 404);
    return Response.json({ data: result.rows[0] });
  } catch (error) { return authErrorResponse(error, "invoices:detail"); }
}

export async function PATCH(request: NextRequest, context: Params) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const parsed = z.object({ status: z.enum(["Draft","Confirmed","Cancelled"]) }).safeParse(await request.json());
  if (!parsed.success) return validationError("Choose Draft, Confirmed, or Cancelled.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT i.id,i.status,i.total_amount,u.assigned_staff_id
         FROM invoices i JOIN users u ON u.id=i.customer_id
        WHERE i.id=$1 AND ($2::text='admin' OR u.assigned_staff_id=$3) FOR UPDATE OF i`,
      [id,auth.user.role,auth.user.id],
    );
    if (!current.rows[0]) { await client.query("ROLLBACK"); return validationError("Invoice not found or outside your assigned customers.", 404); }
    const oldStatus = current.rows[0].status as string;
    const nextStatus = parsed.data.status.toLowerCase();
    if (["paid","cancelled"].includes(oldStatus)) { await client.query("ROLLBACK"); return validationError("Paid or cancelled invoices cannot be changed.", 409); }
    if (nextStatus === "confirmed" && oldStatus !== "draft") { await client.query("ROLLBACK"); return validationError("Only draft invoices can be confirmed.", 409); }
    if (nextStatus === "cancelled") {
      const payment = await client.query("SELECT 1 FROM payments WHERE invoice_id=$1 LIMIT 1", [id]);
      if (payment.rowCount) { await client.query("ROLLBACK"); return validationError("An invoice with recorded payments cannot be cancelled.", 409); }
    }
    const updated = await client.query("UPDATE invoices SET status=$1 WHERE id=$2 RETURNING id,status", [nextStatus,id]);
    await client.query("COMMIT");
    return Response.json({ data: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "invoices:update");
  } finally { client.release(); }
}

export async function DELETE(request: NextRequest, context: Params) {
  const auth = await requireApiUser(request, ["admin"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const payment = await pool.query("SELECT 1 FROM payments WHERE invoice_id=$1 LIMIT 1", [id]);
    if (payment.rowCount) return validationError("An invoice with recorded payments cannot be deleted.", 409);
    const result = await pool.query("DELETE FROM invoices WHERE id=$1 AND status IN ('draft','cancelled') RETURNING id", [id]);
    if (!result.rowCount) return validationError("Only unpaid draft or cancelled invoices can be deleted.", 409);
    return Response.json({ success: true });
  } catch (error) { return authErrorResponse(error, "invoices:delete"); }
}
