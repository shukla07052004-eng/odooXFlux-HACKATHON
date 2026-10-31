import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const schema = z.object({
  name: z.string().trim().min(1).max(150),
  plan_id: z.string().uuid().optional().or(z.literal("")),
  validity_days: z.coerce.number().int().positive().max(365).default(30),
  notes: z.string().max(2000).optional(),
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().or(z.literal("")),
  quantity: z.coerce.number().positive(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  try {
    const result = await pool.query(
      `SELECT t.id,t.name,t.plan_id,p.name AS plan_name,t.validity_days,t.notes,t.created_at,
              COALESCE(json_agg(json_build_object('id',ti.id,'product_id',ti.product_id,'variant_id',ti.variant_id,'description',ti.description,'quantity',ti.quantity,'unit_price',ti.unit_price,'tax_rate',ti.tax_rate)) FILTER(WHERE ti.id IS NOT NULL),'[]') AS items
         FROM quotation_templates t LEFT JOIN plans p ON p.id=t.plan_id
         LEFT JOIN quotation_template_items ti ON ti.template_id=t.id
        GROUP BY t.id,p.name ORDER BY t.created_at DESC`,
    );
    return Response.json({ data: result.rows });
  } catch (error) { return authErrorResponse(error, "quotation-templates:list"); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return validationError("Template details are invalid."); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Template details are invalid.");
  const value = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const product = await client.query(
      `SELECT p.name,p.sales_price,COALESCE(t.rate,(SELECT rate FROM taxes WHERE is_active=TRUE AND is_default=TRUE LIMIT 1),0)::numeric AS tax_rate,
              COALESCE(v.additional_price,0)::numeric AS additional_price
         FROM products p LEFT JOIN taxes t ON t.id=p.tax_id AND t.is_active=TRUE
         LEFT JOIN product_variants v ON v.product_id=p.id AND v.id=NULLIF($2,'')::uuid
        WHERE p.id=$1`, [value.product_id,value.variant_id || ""],
    );
    if (!product.rows[0]) { await client.query("ROLLBACK"); return validationError("Selected product or variant was not found.", 404); }
    if (value.variant_id) {
      const variant = await client.query("SELECT 1 FROM product_variants WHERE id=$1 AND product_id=$2", [value.variant_id,value.product_id]);
      if (!variant.rowCount) { await client.query("ROLLBACK"); return validationError("Selected variant does not belong to this product.", 400); }
    }
    const inserted = await client.query("INSERT INTO quotation_templates(name,plan_id,validity_days,notes) VALUES($1,NULLIF($2,'')::uuid,$3,$4) RETURNING id", [value.name,value.plan_id || "",value.validity_days,value.notes ?? null]);
    const price = Number(product.rows[0].sales_price) + Number(product.rows[0].additional_price);
    await client.query("INSERT INTO quotation_template_items(template_id,product_id,variant_id,description,quantity,unit_price,tax_rate) VALUES($1,$2,NULLIF($3,'')::uuid,$4,$5,$6,$7)", [inserted.rows[0].id,value.product_id,value.variant_id || "",product.rows[0].name,value.quantity,price,Number(product.rows[0].tax_rate)]);
    await client.query("COMMIT");
    return Response.json({ success: true, id: inserted.rows[0].id }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    return authErrorResponse(error, "quotation-templates:create");
  } finally { client.release(); }
}
