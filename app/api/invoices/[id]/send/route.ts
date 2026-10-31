import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { sendInvoiceEmail } from "@/lib/email";
import { formatCurrency, formatDate } from "@/lib/format";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT i.id,i.invoice_number,i.total_amount,i.due_date,i.status,i.sent_at,u.name,u.email,u.assigned_staff_id
         FROM invoices i JOIN users u ON u.id=i.customer_id
        WHERE i.id=$1 AND ($2::text='admin' OR u.assigned_staff_id=$3) FOR UPDATE OF i`,
      [id,auth.user.role,auth.user.id],
    );
    const invoice = result.rows[0];
    if (!invoice) { await client.query("ROLLBACK"); return validationError("Invoice not found or outside your assigned customers.", 404); }
    if (["paid","cancelled"].includes(invoice.status)) { await client.query("ROLLBACK"); return validationError("Paid or cancelled invoices cannot be sent.", 409); }
    if (invoice.sent_at) { await client.query("ROLLBACK"); return validationError("This invoice has already been sent.", 409); }
    if (!invoice.email) { await client.query("ROLLBACK"); return validationError("The customer does not have an email address.", 400); }
    await sendInvoiceEmail({ email: invoice.email, name: invoice.name, invoiceNumber: invoice.invoice_number, total: formatCurrency(invoice.total_amount), dueDate: invoice.due_date ? formatDate(invoice.due_date) : "on receipt" });
    const updated = await client.query("UPDATE invoices SET status='sent',sent_at=NOW() WHERE id=$1 RETURNING id,status,sent_at", [id]);
    await client.query("COMMIT");
    return Response.json({ success: true, data: updated.rows[0], message: "Invoice email sent." });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "invoices:send");
  } finally { client.release(); }
}
