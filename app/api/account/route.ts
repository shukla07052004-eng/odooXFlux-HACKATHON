import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["customer"]);
  if (!auth.user) return auth.response;
  try {
    const [subscriptions, invoices] = await Promise.all([
      pool.query(
        `SELECT s.id, s.subscription_number, s.status, s.start_date, s.expiry_date, p.name AS plan_name
           FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
          WHERE s.customer_id = $1 ORDER BY s.created_at DESC`,
        [auth.user.id],
      ),
      pool.query(
        `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.subtotal, i.tax_amount,
                i.discount_amount, i.total_amount, i.status,
                COALESCE(SUM(pay.amount), 0)::numeric AS paid_amount,
                GREATEST(i.total_amount - COALESCE(SUM(pay.amount), 0), 0)::numeric AS outstanding_amount
           FROM invoices i LEFT JOIN payments pay ON pay.invoice_id = i.id
          WHERE i.customer_id = $1 GROUP BY i.id ORDER BY i.invoice_date DESC`,
        [auth.user.id],
      ),
    ]);
    return Response.json({ success: true, user: auth.user, subscriptions: subscriptions.rows, invoices: invoices.rows });
  } catch (error) {
    console.error("[account:billing-data]", error);
    return Response.json({ success: false, message: "Could not load your billing history." }, { status: 500 });
  }
}
