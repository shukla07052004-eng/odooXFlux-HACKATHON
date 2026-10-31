import { z } from "zod";
import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const schema = z.object({ name: z.string().trim().min(1).max(150).optional(), product_type: z.string().trim().max(100).nullable().optional(), sales_price: z.coerce.number().nonnegative().optional(), cost_price: z.coerce.number().nonnegative().optional(), notes: z.string().max(4000).nullable().optional(), variants: z.array(z.object({ name: z.string().trim().min(1).max(100), additional_price: z.coerce.number().nonnegative() })).optional() });
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const { id } = await context.params;
  try { const result = await pool.query(`SELECT p.id,p.name,p.product_type,p.sales_price,p.cost_price,p.notes,p.created_at,COALESCE(json_agg(json_build_object('id',v.id,'name',v.variant_name,'additional_price',v.additional_price)) FILTER (WHERE v.id IS NOT NULL),'[]') AS variants FROM products p LEFT JOIN product_variants v ON v.product_id=p.id WHERE p.id=$1 GROUP BY p.id`, [id]); if (!result.rows[0]) return validationError("Product not found.", 404); return Response.json({ data: result.rows[0] }); }
  catch (error) { return authErrorResponse(error, "products:detail"); }
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin", "staff"]); if (!auth.user) return auth.response;
  const { id } = await context.params; const parsed = schema.safeParse(await request.json()); if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Product details are invalid.");
  const client = await pool.connect();
  try { await client.query("BEGIN"); const { variants, ...values } = parsed.data; const update = await client.query("UPDATE products SET name=COALESCE($1,name),product_type=COALESCE($2,product_type),sales_price=COALESCE($3,sales_price),cost_price=COALESCE($4,cost_price),notes=COALESCE($5,notes) WHERE id=$6 RETURNING *", [values.name ?? null, values.product_type ?? null, values.sales_price ?? null, values.cost_price ?? null, values.notes ?? null, id]); if (!update.rows[0]) { await client.query("ROLLBACK"); return validationError("Product not found.", 404); } if (variants) { await client.query("DELETE FROM product_variants WHERE product_id=$1", [id]); for (const variant of variants) await client.query("INSERT INTO product_variants(product_id,variant_name,additional_price) VALUES($1,$2,$3)", [id, variant.name, variant.additional_price]); } await client.query("COMMIT"); return Response.json({ data: { ...update.rows[0], variants: variants ?? [] } }); }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); return authErrorResponse(error, "products:update"); } finally { client.release(); }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request, ["admin"]); if (!auth.user) return auth.response;
  const { id } = await context.params;
  try { const result = await pool.query("DELETE FROM products WHERE id=$1 RETURNING id", [id]); if (!result.rowCount) return validationError("Product not found.", 404); return Response.json({ success: true }); }
  catch (error) { return authErrorResponse(error, "products:delete"); }
}
