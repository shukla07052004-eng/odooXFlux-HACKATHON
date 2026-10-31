import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { z } from "zod";

const schema = z.object({ subscription_id: z.string().uuid().optional() });

function addInterval(date: Date, interval: string) {
  const next = new Date(date);
  if (interval === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (interval === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function dueDate(date: Date, terms: string) {
  const days = terms === "Net 15" ? 15 : terms === "Net 30" ? 30 : terms === "Net 45" ? 45 : 0;
  const due = new Date(date);
  due.setUTCDate(due.getUTCDate() + days);
  return dateString(due);
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError("Choose a valid subscription to invoice.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const filter = parsed.data.subscription_id ? "AND s.id=$3" : "";
    const values: unknown[] = [auth.user.id, auth.user.role];
    if (parsed.data.subscription_id) values.push(parsed.data.subscription_id);
    const subscriptions = await client.query(
      `SELECT s.id,s.customer_id,s.plan_id,s.payment_terms,s.next_billing_date,s.expiry_date,
              p.billing_interval,p.auto_close,p.allow_renewal
         FROM subscriptions s JOIN plans p ON p.id=s.plan_id
         JOIN users c ON c.id=s.customer_id
        WHERE s.status='active' AND s.next_billing_date <= CURRENT_DATE
          AND (s.expiry_date IS NULL OR s.expiry_date >= s.next_billing_date)
          AND ($2::text='admin' OR c.assigned_staff_id=$1) ${filter}
        ORDER BY s.next_billing_date,s.id
        FOR UPDATE OF s SKIP LOCKED LIMIT 100`, values,
    );
    const settings = await client.query("SELECT setting_value->>'invoice_prefix' AS prefix FROM workspace_settings WHERE setting_key='workspace'");
    const prefix = String(settings.rows[0]?.prefix || "BL-INV").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || "BL-INV";
    const defaultTax = await client.query("SELECT rate FROM taxes WHERE is_active=TRUE AND is_default=TRUE LIMIT 1");
    const defaultTaxRate = Number(defaultTax.rows[0]?.rate ?? 0);
    const created: Array<{ id: string; invoice_number: string; subscription_id: string }> = [];
    const skipped: string[] = [];

    for (const subscription of subscriptions.rows) {
      const start = new Date(`${subscription.next_billing_date.toISOString?.().slice(0, 10) ?? subscription.next_billing_date}T00:00:00.000Z`);
      const next = addInterval(start, subscription.billing_interval);
      const naturalEnd = new Date(next);
      naturalEnd.setUTCDate(naturalEnd.getUTCDate() - 1);
      const expiry = subscription.expiry_date ? new Date(`${String(subscription.expiry_date).slice(0, 10)}T00:00:00.000Z`) : null;
      const periodEnd = expiry && expiry < naturalEnd ? expiry : naturalEnd;
      const items = await client.query(
        `SELECT si.id,si.product_id,si.variant_id,si.description,si.quantity,si.unit_price,
                COALESCE(t.rate,$2,si.tax_rate,0)::numeric AS tax_rate
           FROM subscription_items si
           LEFT JOIN products p ON p.id=si.product_id
           LEFT JOIN taxes t ON t.id=p.tax_id AND t.is_active=TRUE
          WHERE si.subscription_id=$1 ORDER BY si.created_at,si.id`,
        [subscription.id, defaultTaxRate],
      );
      if (!items.rows.length) {
        skipped.push(subscription.id);
        continue;
      }
      const subtotal = items.rows.reduce((sum: number, item: { quantity: string; unit_price: string }) => sum + Number(item.quantity) * Number(item.unit_price), 0);
      const grossTax = items.rows.reduce((sum: number, item: { quantity: string; unit_price: string; tax_rate: string }) => sum + Number(item.quantity) * Number(item.unit_price) * Number(item.tax_rate) / 100, 0);
      const quantity = items.rows.reduce((sum: number, item: { quantity: string }) => sum + Number(item.quantity), 0);
      const productIds = new Set(items.rows.map((item: { product_id: string | null }) => item.product_id).filter(Boolean));
      const discounts = await client.query(
        `SELECT id,name,discount_type,discount_value,minimum_purchase_amount,minimum_quantity,applicable_products,maximum_usage_count,usage_count
           FROM discounts
          WHERE status='Active' AND (start_date IS NULL OR start_date <= CURRENT_DATE)
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            AND (maximum_usage_count IS NULL OR usage_count < maximum_usage_count)
          ORDER BY created_at,id FOR UPDATE`,
      );
      const discount = discounts.rows.find((candidate) => {
        const eligibleProducts = (candidate.applicable_products as string[]).filter(Boolean);
        return subtotal >= Number(candidate.minimum_purchase_amount) && quantity >= Number(candidate.minimum_quantity)
          && (eligibleProducts.length === 0 || eligibleProducts.some((id) => productIds.has(id)));
      });
      const discountAmount = discount ? Math.min(subtotal, discount.discount_type === "Percentage" ? subtotal * Number(discount.discount_value) / 100 : Number(discount.discount_value)) : 0;
      const taxAmount = subtotal > 0 ? grossTax * (subtotal - discountAmount) / subtotal : 0;
      const total = Math.max(0, subtotal - discountAmount + taxAmount);
      const sequence = await client.query("SELECT nextval('billing_invoice_number_seq') AS value");
      const invoiceNumber = `${prefix}-${new Date().getUTCFullYear()}-${String(sequence.rows[0].value).padStart(6, "0")}`;
      const invoiceDate = new Date();
      const inserted = await client.query(
        `INSERT INTO invoices(invoice_number,subscription_id,customer_id,invoice_date,due_date,period_start,period_end,subtotal,tax_amount,discount_amount,total_amount,discount_id,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'confirmed')
         ON CONFLICT(subscription_id,period_start) WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL DO NOTHING
         RETURNING id`,
        [invoiceNumber,subscription.id,subscription.customer_id,dateString(invoiceDate),dueDate(invoiceDate,subscription.payment_terms),dateString(start),dateString(periodEnd),subtotal,taxAmount,discountAmount,total,discount?.id ?? null],
      );
      if (!inserted.rows[0]) {
        skipped.push(subscription.id);
        continue;
      }
      for (const item of items.rows) {
        await client.query(
          "INSERT INTO invoice_items(invoice_id,product_id,description,variant_id,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [inserted.rows[0].id,item.product_id,item.description,item.variant_id,item.quantity,item.unit_price,item.tax_rate],
        );
      }
      if (discount) {
        await client.query("UPDATE discounts SET usage_count=usage_count+1,status=CASE WHEN maximum_usage_count IS NOT NULL AND usage_count+1 >= maximum_usage_count THEN 'Exhausted' ELSE status END WHERE id=$1", [discount.id]);
      }
      const expiredThisPeriod = expiry && periodEnd >= expiry;
      const renew = expiredThisPeriod && subscription.allow_renewal && !subscription.auto_close;
      const close = expiredThisPeriod && !renew;
      const renewedExpiry = renew ? dateString(addInterval(expiry, subscription.billing_interval)) : subscription.expiry_date;
      await client.query(
        "UPDATE subscriptions SET next_billing_date=$1,expiry_date=$2,status=CASE WHEN $3 THEN 'closed' ELSE status END WHERE id=$4",
        [dateString(next),renewedExpiry,close,subscription.id],
      );
      created.push({ id: inserted.rows[0].id, invoice_number: invoiceNumber, subscription_id: subscription.id });
    }
    await client.query("COMMIT");
    return Response.json({ success: true, data: created, skipped, message: `${created.length} invoice${created.length === 1 ? "" : "s"} generated.` });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "invoices:generate");
  } finally { client.release(); }
}
