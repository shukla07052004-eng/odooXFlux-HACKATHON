import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { sendVerificationEmail } from "@/lib/email";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const customerSchema = z.object({ name: z.string().trim().min(2).max(150), email: z.string().trim().toLowerCase().email().max(255), phone: z.string().trim().max(40).optional(), company: z.string().trim().max(150).optional(), address: z.string().trim().max(1000).optional() });

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, company, address, is_active, is_verified, created_at,
              CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END AS status
         FROM users WHERE role = 'customer' AND ($1::text = 'admin' OR assigned_staff_id = $2) ORDER BY created_at DESC`,
      [auth.user.role, auth.user.id],
    );
    return Response.json({ data: result.rows });
  } catch (error) { return authErrorResponse(error, "customers:list"); }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin", "staff"]);
  if (!auth.user) return auth.response;
  let client;
  try {
    const parsed = customerSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Customer details are invalid.");
    const { name, email, phone, company, address } = parsed.data;
    const code = generateEmailCode();
    const invitePassword = randomBytes(32).toString("base64url");
    const passwordHash = await bcrypt.hash(invitePassword, 12);
    client = await pool.connect(); await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_active, is_verified, phone, company, address, assigned_staff_id,
                          verification_code_hash, verification_code_expiry, verification_sent_at)
       VALUES ($1, $2, $3, 'customer', TRUE, FALSE, $4, $5, $6, CASE WHEN $8='staff' THEN $9::uuid ELSE NULL END, $7, NOW() + INTERVAL '10 minutes', NOW())
       RETURNING id, name, email, phone, company, address, is_active, is_verified, created_at`,
      [name, email, passwordHash, phone ?? null, company ?? null, address ?? null, hashAuthSecret(code), auth.user.role, auth.user.id],
    );
    await client.query("COMMIT");
    await sendVerificationEmail({ email, name, code });
    return Response.json({ data: { ...result.rows[0], status: "Active" } }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("A user with this email already exists.", 409);
    return authErrorResponse(error, "customers:create");
  } finally { client?.release(); }
}
