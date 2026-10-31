import { z } from "zod";
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { sendVerificationEmail } from "@/lib/email";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const updateSchema = z.object({ name: z.string().trim().min(2).max(150).optional(), email: z.string().trim().toLowerCase().email().max(255).optional(), phone: z.string().trim().max(40).nullable().optional(), company: z.string().trim().max(150).nullable().optional(), address: z.string().trim().max(1000).nullable().optional(), status: z.enum(["Active", "Inactive", "Prospect"]).optional() });
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const [customer, subscriptions, invoices] = await Promise.all([
      pool.query("SELECT id,name,email,phone,company,address,is_active,is_verified,created_at FROM users WHERE id=$1 AND role='customer' AND ($2::text='admin' OR assigned_staff_id=$3)", [id, auth.user.role, auth.user.id]),
      pool.query("SELECT s.id,s.subscription_number,s.status,s.start_date,s.expiry_date,p.name AS plan_name FROM subscriptions s LEFT JOIN plans p ON p.id=s.plan_id WHERE s.customer_id=$1 ORDER BY s.created_at DESC", [id]),
      pool.query("SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.total_amount,i.status FROM invoices i WHERE i.customer_id=$1 ORDER BY i.invoice_date DESC", [id]),
    ]);
    if (!customer.rows[0]) return validationError("Customer not found.", 404);
    return Response.json({ data: { ...customer.rows[0], status: customer.rows[0].is_active ? "Active" : "Inactive", subscriptions: subscriptions.rows, invoices: invoices.rows } });
  } catch (error) { return authErrorResponse(error, "customers:detail"); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const parsed = updateSchema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Customer details are invalid.");
    const value = parsed.data; const existing = await pool.query("SELECT id,email,name FROM users WHERE id=$1 AND role='customer' AND ($2::text='admin' OR assigned_staff_id=$3)", [id, auth.user.role, auth.user.id]);
    if (!existing.rows[0]) return validationError("Customer not found.", 404);
    const email = value.email ?? existing.rows[0].email;
    const changedEmail = value.email !== undefined && value.email !== existing.rows[0].email;
    const code = changedEmail ? generateEmailCode() : null;
    const result = await pool.query(
      `UPDATE users SET name=COALESCE($1,name), email=$2, phone=COALESCE($3,phone), company=COALESCE($4,company), address=COALESCE($5,address),
        is_active=CASE WHEN $6='Active' THEN TRUE WHEN $6='Inactive' THEN FALSE ELSE is_active END,
        is_verified=CASE WHEN $7 THEN FALSE ELSE is_verified END,
        verification_code_hash=CASE WHEN $7 THEN $8 ELSE verification_code_hash END,
        verification_code_expiry=CASE WHEN $7 THEN NOW() + INTERVAL '10 minutes' ELSE verification_code_expiry END,
        verification_attempts=CASE WHEN $7 THEN 0 ELSE verification_attempts END,
        verification_sent_at=CASE WHEN $7 THEN NOW() ELSE verification_sent_at END,
        updated_at=NOW()
       WHERE id=$9 AND role='customer' AND ($10::text='admin' OR assigned_staff_id=$11)
       RETURNING id,name,email,phone,company,address,is_active,is_verified,created_at`,
      [value.name ?? null, email, value.phone ?? null, value.company ?? null, value.address ?? null, value.status ?? null, changedEmail, code ? hashAuthSecret(code) : null, id, auth.user.role, auth.user.id],
    );
    if (changedEmail && code) await sendVerificationEmail({ email, name: result.rows[0].name, code });
    return Response.json({ data: { ...result.rows[0], status: result.rows[0].is_active ? "Active" : "Inactive" }, message: changedEmail ? "Customer updated. The new email must be verified." : "Customer updated." });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("A user with this email already exists.", 409);
    return authErrorResponse(error, "customers:update");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const { id } = await context.params;
  try {
    const result = await pool.query("UPDATE users SET is_active=FALSE,updated_at=NOW() WHERE id=$1 AND role='customer' AND ($2::text='admin' OR assigned_staff_id=$3) RETURNING id", [id, auth.user.role, auth.user.id]);
    if (!result.rowCount) return validationError("Customer not found.", 404);
    return Response.json({ success: true, message: "Customer deactivated." });
  } catch (error) { return authErrorResponse(error, "customers:deactivate"); }
}
