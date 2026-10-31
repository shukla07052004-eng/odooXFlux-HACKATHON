import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const schema = z.object({ name: z.string().trim().min(1).max(150), product_type: z.string().trim().max(100).optional(), sales_price: z.coerce.number().nonnegative(), cost_price: z.coerce.number().nonnegative().optional(), notes: z.string().max(4000).optional(), variants: z.array(z.object({ name: z.string().trim().min(1).max(100), additional_price: z.coerce.number().nonnegative() })).optional() });
const productSelect = `SELECT p.id,p.name,p.product_type,p.sales_price,p.cost_price,p.notes,p.created_at,'Active'::text AS status,
  COALESCE(json_agg(json_build_object('id',v.id,'name',v.variant_name,'additional_price',v.additional_price)) FILTER (WHERE v.id IS NOT NULL),'[]') AS variants
  FROM products p LEFT JOIN product_variants v ON v.product_id=p.id`;

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  try {
    const search = new URL(request.url).searchParams;
    const page = Math.max(1, Number(search.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(search.get("pageSize") || 50)));
    const paginate = search.has("page") || search.has("pageSize");
    const count = paginate ? await pool.query("SELECT COUNT(*)::int AS total FROM products") : null;
    const suffix = paginate ? " LIMIT $1 OFFSET $2" : "";
    const result = await pool.query(`${productSelect} GROUP BY p.id ORDER BY p.created_at DESC${suffix}`, paginate ? [pageSize,(page-1)*pageSize] : []);
    return Response.json({ data: result.rows, ...(count ? { pagination: { page, pageSize, total: count.rows[0].total, totalPages: Math.max(1,Math.ceil(count.rows[0].total/pageSize)) } } : {}) });
  }
  catch (error) { return authErrorResponse(error, "products:list"); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Product details are invalid.");
  const { variants = [], ...product } = parsed.data; const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO products(name,product_type,sales_price,cost_price,notes) VALUES($1,$2,$3,$4,$5) RETURNING *", [product.name, product.product_type ?? null, product.sales_price, product.cost_price ?? 0, product.notes ?? null]);
    for (const variant of variants) await client.query("INSERT INTO product_variants(product_id,variant_name,additional_price) VALUES($1,$2,$3)", [inserted.rows[0].id, variant.name, variant.additional_price]);
    await client.query("COMMIT"); return Response.json({ data: { ...inserted.rows[0], variants } }, { status: 201 });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return authErrorResponse(error, "products:create"); }
  finally { client.release(); }
}
