import { z } from "zod";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const itemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  variant_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().positive(),
  unit_price: z.coerce.number().nonnegative().optional(),
});
const schema = z.object({
  customer_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional().or(z.literal("")),
  invoice_date: z.string().date(),
  due_date: z.string().date().optional().or(z.literal("")),
  subtotal: z.coerce.number().nonnegative().optional(),
  discount_id: z.string().uuid().optional().or(z.literal("")),
  discount_amount: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(4000).optional(),
  items: z.array(itemSchema).min(1).optional(),
});

async function nextInvoiceNumber(client: PoolClient) {
  const [settings, sequence] = await Promise.all([
    client.query("SELECT setting_value->>'invoice_prefix' AS prefix FROM workspace_settings WHERE setting_key='workspace'"),
    client.query("SELECT nextval('billing_invoice_number_seq') AS value"),
  ]);
  const prefix = String(settings.rows[0]?.prefix || "BL-INV").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20) || "BL-INV";
  return `${prefix}-${new Date().getUTCFullYear()}-${String(sequence.rows[0].value).padStart(6, "0")}`;
}

const select = `SELECT i.id,i.invoice_number,i.customer_id,u.name AS customer_name,i.subscription_id,s.subscription_number,
  i.invoice_date,i.due_date,i.period_start,i.period_end,i.sent_at,i.subtotal,i.tax_amount,i.discount_amount,i.total_amount,
  pay.paid_amount,GREATEST(i.total_amount-pay.paid_amount,0)::numeric AS outstanding_amount,
  lines.items,
  CASE WHEN i.status IN ('confirmed','sent') AND i.due_date < CURRENT_DATE AND i.total_amount>pay.paid_amount THEN 'overdue'
       WHEN i.status='draft' THEN 'Draft' WHEN i.status='confirmed' THEN 'Confirmed'
       WHEN i.status='sent' THEN 'Sent' WHEN i.status='paid' THEN 'Paid'
       WHEN i.status='cancelled' THEN 'Cancelled' ELSE i.status END AS status
  FROM invoices i LEFT JOIN users u ON u.id=i.customer_id LEFT JOIN subscriptions s ON s.id=i.subscription_id
  LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0)::numeric AS paid_amount FROM payments WHERE invoice_id=i.id) pay ON TRUE
  LEFT JOIN LATERAL (SELECT COALESCE(json_agg(json_build_object('id',ii.id,'product_id',ii.product_id,'variant_id',ii.variant_id,'description',ii.description,'quantity',ii.quantity,'unit_price',ii.unit_price,'tax_rate',ii.tax_rate)),'[]') AS items FROM invoice_items ii WHERE ii.invoice_id=i.id) lines ON TRUE`;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.user) return auth.response;
  try {
    const search = new URL(request.url).searchParams;
    const page = Math.max(1, Number(search.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(search.get("pageSize") || 50)));
    const filter = search.get("status")?.trim().toLowerCase();
    const query = search.get("q")?.trim();
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (auth.user.role === "customer") { values.push(auth.user.id); conditions.push(`i.customer_id=$${values.length}`); }
    if (auth.user.role === "staff") { values.push(auth.user.id); conditions.push(`u.assigned_staff_id=$${values.length}`); }
    if (filter === "overdue") conditions.push("i.status IN ('confirmed','sent') AND i.due_date<CURRENT_DATE AND i.total_amount>COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0)");
    else if (filter && ["draft", "confirmed", "sent", "paid", "cancelled"].includes(filter)) { values.push(filter); conditions.push(`i.status=$${values.length}`); }
    if (query) { values.push(`%${query}%`); conditions.push(`(i.invoice_number ILIKE $${values.length} OR u.name ILIKE $${values.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM invoices i LEFT JOIN users u ON u.id=i.customer_id ${where}`, values);
    const offset = (page - 1) * pageSize;
    const rows = await pool.query(`${select} ${where} ORDER BY i.invoice_date DESC,i.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values,pageSize,offset]);
    return Response.json({ data: rows.rows, pagination: { page, pageSize, total: count.rows[0].total, totalPages: Math.max(1, Math.ceil(count.rows[0].total / pageSize)) } });
  } catch (error) { return authErrorResponse(error, "invoices:list"); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return validationError("Invoice details are invalid."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Invoice details are invalid.");
  const value = parsed.data;
  const lines = value.items ?? [{ product_id: null, variant_id: null, description: value.notes?.trim() || "Subscription services", quantity: 1, unit_price: value.subtotal ?? 0 }];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customer = await client.query("SELECT id FROM users WHERE id=$1 AND role='customer' AND ($2::text='admin' OR assigned_staff_id=$3) FOR KEY SHARE", [value.customer_id,auth.user.role,auth.user.id]);
    if (!customer.rows[0]) { await client.query("ROLLBACK"); return validationError("Customer not found or outside your assigned customers.", 403); }
    if (value.subscription_id) {
      const subscription = await client.query("SELECT id FROM subscriptions WHERE id=$1 AND customer_id=$2", [value.subscription_id,value.customer_id]);
      if (!subscription.rows[0]) { await client.query("ROLLBACK"); return validationError("Subscription does not belong to this customer.", 400); }
    }
    const defaultTax = await client.query("SELECT rate FROM taxes WHERE is_active=TRUE AND is_default=TRUE LIMIT 1");
    const defaultRate = Number(defaultTax.rows[0]?.rate ?? 0);
    const pricedLines = [] as Array<typeof lines[number] & { product_id: string | null; variant_id: string | null; unit_price: number; tax_rate: number }>;
    for (const item of lines) {
      if (item.variant_id || item.product_id) {
        const product = await client.query(
          `SELECT p.id,p.sales_price,COALESCE(v.additional_price,0)::numeric AS additional_price,
                  COALESCE(t.rate,$3,0)::numeric AS tax_rate,v.id AS variant_id
             FROM products p
             LEFT JOIN product_variants v ON v.product_id=p.id AND v.id=$2
             LEFT JOIN taxes t ON t.id=p.tax_id AND t.is_active=TRUE
            WHERE ($1::uuid IS NOT NULL AND p.id=$1) OR ($2::uuid IS NOT NULL AND v.id=$2)
            LIMIT 1`,
          [item.product_id ?? null,item.variant_id ?? null,defaultRate],
        );
        if (!product.rows[0] || (item.variant_id && !product.rows[0].variant_id)) { await client.query("ROLLBACK"); return validationError("Selected product or variant was not found.", 400); }
        if (item.product_id && item.variant_id && product.rows[0].id !== item.product_id) { await client.query("ROLLBACK"); return validationError("Selected variant does not belong to this product.", 400); }
        pricedLines.push({ ...item, product_id: product.rows[0].id, variant_id: product.rows[0].variant_id, unit_price: Number(product.rows[0].sales_price) + Number(product.rows[0].additional_price), tax_rate: Number(product.rows[0].tax_rate) });
      } else {
        if (item.unit_price === undefined) { await client.query("ROLLBACK"); return validationError("Custom invoice lines require a unit price."); }
        pricedLines.push({ ...item, product_id: null, variant_id: null, unit_price: item.unit_price, tax_rate: defaultRate });
      }
    }
    const subtotal = pricedLines.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const grossTax = pricedLines.reduce((sum, item) => sum + item.quantity * item.unit_price * item.tax_rate / 100, 0);
    let discount = value.discount_amount ?? 0;
    let discountId: string | null = null;
    if (value.discount_id) {
      const eligible = await client.query("SELECT * FROM discounts WHERE id=$1 AND status='Active' AND (start_date IS NULL OR start_date<=CURRENT_DATE) AND (end_date IS NULL OR end_date>=CURRENT_DATE) AND (maximum_usage_count IS NULL OR usage_count<maximum_usage_count) FOR UPDATE", [value.discount_id]);
      const rule = eligible.rows[0];
      const quantity = pricedLines.reduce((sum,item)=>sum+item.quantity,0);
      const productIds = new Set(pricedLines.map((item)=>item.product_id).filter(Boolean));
      const applies = rule && subtotal >= Number(rule.minimum_purchase_amount) && quantity >= Number(rule.minimum_quantity)
        && (!(rule.applicable_products as string[]).length || (rule.applicable_products as string[]).some((id)=>productIds.has(id)));
      if (!applies) { await client.query("ROLLBACK"); return validationError("Selected discount is expired, exhausted, or does not meet its requirements.", 409); }
      discount = Math.min(subtotal, rule.discount_type === "Percentage" ? subtotal * Number(rule.discount_value) / 100 : Number(rule.discount_value));
      discountId = rule.id;
    }
    const tax = subtotal > 0 ? grossTax * (subtotal - discount) / subtotal : 0;
    if (discount > subtotal) { await client.query("ROLLBACK"); return validationError("Discount cannot exceed the invoice subtotal."); }
    const total = Math.max(0, subtotal + tax - discount);
    const invoiceNumber = await nextInvoiceNumber(client);
    const inserted = await client.query(
      `INSERT INTO invoices(invoice_number,subscription_id,customer_id,invoice_date,due_date,subtotal,tax_amount,discount_amount,discount_id,total_amount,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft') RETURNING id`,
      [invoiceNumber,value.subscription_id || null,value.customer_id,value.invoice_date,value.due_date || null,subtotal,tax,discount,discountId,total],
    );
    for (const item of pricedLines) {
      await client.query("INSERT INTO invoice_items(invoice_id,product_id,description,variant_id,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5,$6,$7)", [inserted.rows[0].id,item.product_id,item.description,item.variant_id,item.quantity,item.unit_price,item.tax_rate]);
    }
    if (discountId) await client.query("UPDATE discounts SET usage_count=usage_count+1,status=CASE WHEN maximum_usage_count IS NOT NULL AND usage_count+1>=maximum_usage_count THEN 'Exhausted' ELSE status END WHERE id=$1",[discountId]);
    await client.query("COMMIT");
    return Response.json({ success: true, id: inserted.rows[0].id, invoice_number: invoiceNumber, subtotal, tax_amount: tax, discount_amount: discount, total_amount: total }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("Invoice number already exists.", 409);
    return authErrorResponse(error, "invoices:create");
  } finally { client.release(); }
}
