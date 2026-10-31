import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { sendVerificationEmail } from "@/lib/email";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const staffSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(150).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(request, ["admin"]);
  if (!auth.user) return auth.response;

  try {
    const search = new URL(request.url).searchParams;
    const query = search.get("q")?.trim() ?? "";
    const role = search.get("role") ?? "all";
    const status = search.get("status") ?? "all";
    const page = Math.max(1, Number.parseInt(search.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(search.get("pageSize") ?? "10", 10) || 10));
    if (role !== "all" && !["admin", "staff", "customer"].includes(role)) return validationError("Choose a valid user role.");
    if (status !== "all" && !["active", "inactive"].includes(status)) return validationError("Choose a valid account status.");

    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (query) {
      values.push(`%${query}%`);
      conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }
    if (role !== "all") {
      values.push(role);
      conditions.push(`role = $${values.length}`);
    }
    if (status !== "all") {
      values.push(status === "active");
      conditions.push(`is_active = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, values);
    const total = countResult.rows[0].total as number;
    const listValues = [...values, pageSize, (page - 1) * pageSize];
    const result = await pool.query(
      `SELECT id,name,email,phone,company,role,is_active,is_verified,created_at
         FROM users ${where}
        ORDER BY created_at DESC, id
        LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );
    const statsResult = await pool.query(
      `SELECT COUNT(*)::int AS total_users,
              COUNT(*) FILTER (WHERE role='admin')::int AS total_admins,
              COUNT(*) FILTER (WHERE role='staff')::int AS total_staff,
              COUNT(*) FILTER (WHERE role='customer')::int AS total_customers,
              COUNT(*) FILTER (WHERE is_active=TRUE)::int AS active_users,
              COUNT(*) FILTER (WHERE is_active=FALSE)::int AS inactive_users
         FROM users`,
    );
    return Response.json({
      success: true,
      data: result.rows,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      stats: statsResult.rows[0],
    });
  } catch (error) {
    return authErrorResponse(error, "users:list");
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request, ["admin"]);
  if (!auth.user) return auth.response;

  let client;
  try {
    const parsed = staffSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Staff details are invalid.");
    const { name, email, phone, company } = parsed.data;
    const code = generateEmailCode();
    const generatedPassword = randomBytes(48).toString("base64url");
    const passwordHash = await bcrypt.hash(generatedPassword, 12);

    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [email]);
    const existing = await client.query("SELECT id FROM users WHERE LOWER(email)=$1 FOR UPDATE", [email]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return validationError("A user with this email already exists.", 409);
    }
    const inserted = await client.query(
      `INSERT INTO users(name,email,password_hash,role,is_active,is_verified,phone,company,
                         verification_code_hash,verification_code_expiry,verification_attempts,verification_sent_at)
       VALUES($1,$2,$3,'staff',TRUE,FALSE,$4,$5,$6,NOW()+INTERVAL '10 minutes',0,NOW())
       RETURNING id,name,email,phone,company,role,is_active,is_verified,created_at`,
      [name, email, passwordHash, phone ?? null, company ?? null, hashAuthSecret(code)],
    );
    await client.query("COMMIT");
    try {
      await sendVerificationEmail({ email, name, code });
      return Response.json({ success: true, data: inserted.rows[0], invitationSent: true, message: "Staff account created. The verification email has been sent." }, { status: 201 });
    } catch (emailError) {
      console.error("[users:create:invitation-email]", emailError);
      return Response.json({ success: true, data: inserted.rows[0], invitationSent: false, message: "Staff account created, but the verification email could not be delivered. Check the email provider configuration." }, { status: 201 });
    }
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("A user with this email already exists.", 409);
    return authErrorResponse(error, "users:create-staff");
  } finally {
    client?.release();
  }
}
