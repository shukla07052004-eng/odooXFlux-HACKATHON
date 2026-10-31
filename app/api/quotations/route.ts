import { randomInt } from "node:crypto";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const itemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().positive(),
});
const createSchema = z.object({
  customer_id: z.string().uuid(),
  plan_id: z.string().uuid().optional().or(z.literal("")),
  template_id: z.string().uuid().optional().or(z.literal("")),
  valid_until: z.string().date().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
  product_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().positive().optional(),
  tax_rate: z.coerce.number().min(0).max(100).optional(),
  items: z.array(itemSchema).min(1).max(50).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (!auth.user) return auth.response;
  try {
    const search = new URL(request.url).searchParams;
    const page = Math.max(1, Number(search.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(search.get("pageSize") || 50)));
    const paginate = search.has("page") || search.has("pageSize");
    const scope = auth.user.role === "customer" ? "q.customer_id=$1" : auth.user.role === "staff" ? "EXISTS(SELECT 1 FROM users c WHERE c.id=q.customer_id AND c.assigned_staff_id=$1)" : "";
    const count = paginate ? await pool.query(`SELECT COUNT(*)::int AS total FROM quotations q ${scope ? `WHERE ${scope}` : ""}`, scope ? [auth.user.id] : []) : null;
    const result = await pool.query(
      `SELECT q.id,q.quotation_number,q.customer_id,u.name AS customer_name,q.plan_id,p.name AS plan_name,
              q.template_id,t.name AS template_name,q.valid_until,q.status,q.subtotal,q.tax_amount,q.discount_amount,q.total_amount,q.notes,q.created_at
         FROM quotations q JOIN users u ON u.id=q.customer_id LEFT JOIN plans p ON p.id=q.plan_id
         LEFT JOIN quotation_templates t ON t.id=q.template_id ${scope ? `WHERE ${scope}` : ""}
         ORDER BY q.created_at DESC${paginate ? ` LIMIT $${scope ? 2 : 1} OFFSET $${scope ? 3 : 2}` : ""}`, paginate ? (scope ? [auth.user.id,pageSize,(page-1)*pageSize] : [pageSize,(page-1)*pageSize]) : (scope ? [auth.user.id] : []),
    );
    return Response.json({ data: result.rows, ...(count ? { pagination: { page, pageSize, total: count.rows[0].total, totalPages: Math.max(1,Math.ceil(count.rows[0].total/pageSize)) } } : {}) });
  } catch (error) { return authErrorResponse(error, "quotations:list"); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return validationError("Quotation details are invalid."); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Quotation details are invalid.");
  const value = parsed.data;
  if (!value.template_id && !value.items?.length && (!value.product_id || !value.quantity)) return validationError("Choose a quotation template or add a product line.");
  if (!value.template_id && !value.valid_until) return validationError("Set a quotation validity date.");
  if (auth.user.role === "staff") {
    const assigned = await pool.query("SELECT 1 FROM users WHERE id=$1 AND role='customer' AND assigned_staff_id=$2", [value.customer_id,auth.user.id]);
    if (!assigned.rowCount) return validationError("Customer is not assigned to this staff account.", 403);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const items: Array<{ product_id: string | null; variant_id: string | null; description: string; quantity: number; unit_price: number; tax_rate: number }> = [];
    let planId = value.plan_id || null;
    let validUntil = value.valid_until || "";
    let templateId: string | null = null;
    if (value.template_id) {
      const template = await client.query("SELECT id,plan_id,validity_days FROM quotation_templates WHERE id=$1", [value.template_id]);
      if (!template.rows[0]) { await client.query("ROLLBACK"); return validationError("Quotation template not found.", 404); }
      templateId = template.rows[0].id;
      planId = template.rows[0].plan_id;
      const templateItems = await client.query("SELECT product_id,variant_id,description,quantity,unit_price,tax_rate FROM quotation_template_items WHERE template_id=$1 ORDER BY id", [templateId]);
      for (const item of templateItems.rows) items.push({ ...item, quantity: Number(item.quantity), unit_price: Number(item.unit_price), tax_rate: Number(item.tax_rate) });
      const end = new Date();
      end.setDate(end.getDate() + Number(template.rows[0].validity_days));
      validUntil = validUntil || end.toISOString().slice(0,10);
    } else {
      const requestedItems = value.items ?? [{ product_id: value.product_id!, variant_id: value.variant_id || "", quantity: value.quantity! }];
      const defaultTax = await client.query("SELECT rate FROM taxes WHERE is_active=TRUE AND is_default=TRUE LIMIT 1");
      for (const item of requestedItems) {
        const product = await client.query(
          `SELECT p.name,p.sales_price,COALESCE(t.rate,$2,0)::numeric AS tax_rate,
                  COALESCE(v.additional_price,0)::numeric AS additional_price
             FROM products p LEFT JOIN taxes t ON t.id=p.tax_id AND t.is_active=TRUE
             LEFT JOIN product_variants v ON v.product_id=p.id AND v.id=NULLIF($3,'')::uuid
            WHERE p.id=$1`,
          [item.product_id,Number(defaultTax.rows[0]?.rate ?? 0),item.variant_id || ""],
        );
        if (!product.rows[0]) { await client.query("ROLLBACK"); return validationError("Selected product was not found.", 404); }
        if (item.variant_id) {
          const validVariant = await client.query("SELECT 1 FROM product_variants WHERE id=$1 AND product_id=$2", [item.variant_id,item.product_id]);
          if (!validVariant.rowCount) { await client.query("ROLLBACK"); return validationError("Selected variant does not belong to this product.", 400); }
        }
        const base = Number(product.rows[0].sales_price);
        items.push({ product_id: item.product_id, variant_id: item.variant_id || null, description: product.rows[0].name, quantity: item.quantity, unit_price: base + Number(product.rows[0].additional_price), tax_rate: Number(product.rows[0].tax_rate) });
      }
    }
    if (!items.length) { await client.query("ROLLBACK"); return validationError("Quotation template has no product lines.", 409); }
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const tax = items.reduce((sum, item) => sum + item.quantity * item.unit_price * item.tax_rate / 100, 0);
    const number = `BL-QUO-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
    const insert = await client.query(
      `INSERT INTO quotations(quotation_number,customer_id,plan_id,template_id,valid_until,subtotal,tax_amount,total_amount,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [number,value.customer_id,planId,templateId,validUntil,subtotal,tax,subtotal+tax,value.notes ?? null],
    );
    for (const item of items) {
      await client.query("INSERT INTO quotation_items(quotation_id,product_id,variant_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,$3,$4,$5,$6,$7)", [insert.rows[0].id,item.product_id,item.variant_id,item.description,item.quantity,item.unit_price,item.tax_rate]);
    }
    await client.query("COMMIT");
    return Response.json({ success: true, id: insert.rows[0].id, quotation_number: number, total_amount: subtotal + tax }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "quotations:create");
  } finally { client.release(); }
}
