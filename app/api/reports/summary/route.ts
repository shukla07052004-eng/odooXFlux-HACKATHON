import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const dateSchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });

function makeFilter(column: string, staffId: string | null, from?: string, to?: string) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (staffId) { values.push(staffId); conditions.push(`c.assigned_staff_id=$${values.length}`); }
  if (from) { values.push(from); conditions.push(`${column}>=$${values.length}::date`); }
  if (to) { values.push(to); conditions.push(`${column}<($${values.length}::date+INTERVAL '1 day')`); }
  return { sql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  const search = new URL(request.url).searchParams;
  const parsed = dateSchema.safeParse({ from: search.get("from") || undefined, to: search.get("to") || undefined });
  if (!parsed.success) return validationError("Choose valid report dates.");
  const staffId = auth.user.role === "staff" ? auth.user.id : null;
  const invoiceFilter = makeFilter("i.invoice_date", staffId, parsed.data.from, parsed.data.to);
  const paymentFilter = makeFilter("p.payment_date", staffId, parsed.data.from, parsed.data.to);
  const scopeInvoices = makeFilter("i.invoice_date", staffId);
  const scopePayments = makeFilter("p.payment_date", staffId);
  const scopeSubscriptions = makeFilter("s.created_at", staffId);
  const scopeRenewals = makeFilter("s.expiry_date", staffId);
  try {
    const [invoiceMetrics, revenue, statusDistribution, revenueByMonth, subscriptionGrowth, recentInvoices, recentPayments, renewals, activeCount] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(i.total_amount-COALESCE(pay.total_paid,0)) FILTER(WHERE i.status IN ('confirmed','sent')),0)::numeric AS outstanding_amount,
                COUNT(DISTINCT i.id) FILTER(WHERE i.status IN ('confirmed','sent') AND i.due_date<CURRENT_DATE AND i.total_amount>COALESCE(pay.total_paid,0))::int AS overdue_invoices,
                COUNT(DISTINCT i.id) FILTER(WHERE i.status IN ('confirmed','sent') AND i.total_amount>COALESCE(pay.total_paid,0))::int AS outstanding_invoices
           FROM invoices i JOIN users c ON c.id=i.customer_id
           LEFT JOIN LATERAL(SELECT COALESCE(SUM(amount),0)::numeric AS total_paid FROM payments WHERE invoice_id=i.id) pay ON TRUE
           ${invoiceFilter.sql}`,
        invoiceFilter.values,
      ),
      pool.query(`SELECT COALESCE(SUM(p.amount),0)::numeric AS collected_revenue,COUNT(*)::int AS payment_count FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN users c ON c.id=i.customer_id ${paymentFilter.sql}`, paymentFilter.values),
      pool.query(`SELECT s.status,COUNT(*)::int AS count FROM subscriptions s JOIN users c ON c.id=s.customer_id ${scopeSubscriptions.sql} GROUP BY s.status ORDER BY s.status`, scopeSubscriptions.values),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',p.payment_date),'Mon') AS month,DATE_TRUNC('month',p.payment_date) AS month_start,COALESCE(SUM(p.amount),0)::numeric AS amount FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN users c ON c.id=i.customer_id WHERE p.payment_date>=DATE_TRUNC('month',CURRENT_DATE)-INTERVAL '5 months' ${staffId ? "AND c.assigned_staff_id=$1" : ""} GROUP BY month_start ORDER BY month_start`, staffId ? [staffId] : []),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',s.created_at),'Mon') AS month,DATE_TRUNC('month',s.created_at) AS month_start,COUNT(*)::int AS count FROM subscriptions s JOIN users c ON c.id=s.customer_id WHERE s.created_at>=DATE_TRUNC('month',CURRENT_DATE)-INTERVAL '5 months' ${staffId ? "AND c.assigned_staff_id=$1" : ""} GROUP BY month_start ORDER BY month_start`, staffId ? [staffId] : []),
      pool.query(`SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.total_amount,i.status,u.name AS customer_name,COALESCE(pay.total_paid,0)::numeric AS paid_amount FROM invoices i JOIN users u ON u.id=i.customer_id LEFT JOIN LATERAL(SELECT SUM(amount) AS total_paid FROM payments WHERE invoice_id=i.id) pay ON TRUE ${scopeInvoices.sql} ORDER BY i.invoice_date DESC LIMIT 6`, scopeInvoices.values),
      pool.query(`SELECT p.id,p.amount,p.payment_date,p.payment_method,i.invoice_number,u.name AS customer_name FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN users u ON u.id=i.customer_id ${scopePayments.sql} ORDER BY p.payment_date DESC LIMIT 6`, scopePayments.values),
      pool.query(`SELECT s.id,s.subscription_number,s.expiry_date,u.name AS customer_name,p.name AS plan_name FROM subscriptions s JOIN users u ON u.id=s.customer_id LEFT JOIN plans p ON p.id=s.plan_id ${scopeRenewals.sql ? `${scopeRenewals.sql} AND` : "WHERE"} s.status='active' AND s.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+INTERVAL '30 days' ORDER BY s.expiry_date LIMIT 6`, scopeRenewals.values),
      pool.query(`SELECT COUNT(*)::int AS count FROM subscriptions s JOIN users c ON c.id=s.customer_id WHERE s.status='active' ${staffId ? "AND c.assigned_staff_id=$1" : ""}`, staffId ? [staffId] : []),
    ]);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (5 - index));
      return { key: date.toISOString().slice(0, 7), month: date.toLocaleString("en", { month: "short", timeZone: "UTC" }) };
    });
    const mapMonth = (rows: Array<{ month_start: string | Date; amount?: string; count?: number }>, field: "amount" | "count") => new Map(rows.map((row) => [new Date(row.month_start).toISOString().slice(0, 7), Number(row[field] ?? 0)]));
    const revenueMap = mapMonth(revenueByMonth.rows, "amount");
    const growthMap = mapMonth(subscriptionGrowth.rows, "count");
    const today = new Date().toISOString().slice(0, 10);
    const recent = recentInvoices.rows.map((row) => ({ ...row, status: ["confirmed", "sent"].includes(row.status) && row.due_date < today && Number(row.total_amount) > Number(row.paid_amount) ? "overdue" : row.status }));
    return Response.json({ data: {
      ...invoiceMetrics.rows[0], collected_revenue: revenue.rows[0].collected_revenue, payment_count: revenue.rows[0].payment_count,
      active_subscriptions: activeCount.rows[0].count,
      status_distribution: statusDistribution.rows,
      revenue_by_month: months.map((month) => ({ month: month.month, amount: revenueMap.get(month.key) ?? 0 })),
      subscriptions_by_month: months.map((month) => ({ month: month.month, count: growthMap.get(month.key) ?? 0 })),
      recent_invoices: recent, recent_payments: recentPayments.rows, upcoming_renewals: renewals.rows,
    } });
  } catch (error) { return authErrorResponse(error, "reports:summary"); }
}
