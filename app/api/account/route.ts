import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { z } from "zod";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(150).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["customer"]);
  if (!auth.user) return auth.response;
  try {
    const [profile, subscriptions, quotations, invoices, payments] = await Promise.all([
      pool.query("SELECT id,name,email,phone,company,address FROM users WHERE id=$1 AND role='customer'", [auth.user.id]),
      pool.query(
        `SELECT s.id, s.subscription_number, s.status, s.start_date, s.expiry_date, p.name AS plan_name
           FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
          WHERE s.customer_id = $1 ORDER BY s.created_at DESC`,
        [auth.user.id],
      ),
      pool.query(
        `SELECT id,quotation_number,valid_until,status,total_amount
           FROM quotations WHERE customer_id=$1 ORDER BY created_at DESC`,
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
      pool.query(
        `SELECT p.id,p.invoice_id,i.invoice_number,p.amount,p.payment_method,p.payment_date,p.note AS notes
           FROM payments p JOIN invoices i ON i.id=p.invoice_id
          WHERE i.customer_id=$1 ORDER BY p.payment_date DESC`,
        [auth.user.id],
      ),
    ]);
    return Response.json({ success: true, user: profile.rows[0], subscriptions: subscriptions.rows, quotations: quotations.rows, invoices: invoices.rows, payments: payments.rows });
  } catch (error) {
    return authErrorResponse(error, "account:billing-data");
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(request, ["customer"]);
  if (!auth.user) return auth.response;
  try {
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Profile details are invalid.");
    const values = parsed.data;
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const key of ["name", "phone", "company", "address"] as const) {
      if (values[key] !== undefined) {
        params.push(values[key]);
        fields.push(`${key}=$${params.length}`);
      }
    }
    if (!fields.length) return validationError("Provide at least one profile field to update.");
    params.push(auth.user.id);
    const updated = await pool.query(
      `UPDATE users SET ${fields.join(",")},updated_at=NOW() WHERE id=$${params.length} AND role='customer' RETURNING id,name,email,phone,company,address`,
      params,
    );
    if (!updated.rows[0]) return validationError("Customer profile not found.", 404);
    return Response.json({ success: true, user: updated.rows[0], message: "Profile updated." });
  } catch (error) {
    return authErrorResponse(error, "account:update-profile");
  }
}
