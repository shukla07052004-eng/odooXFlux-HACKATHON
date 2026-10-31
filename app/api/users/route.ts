import bcrypt from "bcryptjs";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const passwordSchema = z.string().min(9, "Password must be more than 8 characters").max(72, "Password is too long")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(255),
  password: passwordSchema,
  role: z.enum(["staff", "customer"]),
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
    const values: Array<string | number | boolean> = [];
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
      `SELECT id,name,email,phone,company,address,role,is_active,is_verified,created_at
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
    let body: unknown;
    try { body = await request.json(); } catch { return validationError("Request body must be valid JSON."); }
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "User details are invalid.");
    const { name, email, password, role, phone, company } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);

    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [email]);
    const existing = await client.query("SELECT id FROM users WHERE LOWER(email)=$1 FOR UPDATE", [email]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return validationError("A user with this email already exists.", 409);
    }
    const inserted = await client.query(
      `INSERT INTO users(name,email,password_hash,role,is_active,is_verified,phone,company)
       VALUES($1,$2,$3,$4,TRUE,TRUE,$5,$6)
       RETURNING id,name,email,phone,company,role,is_active,is_verified,created_at`,
      [name, email, passwordHash, role, phone ?? null, company ?? null],
    );
    await client.query("COMMIT");
    return Response.json({
      success: true,
      data: inserted.rows[0],
      message: `${role === "staff" ? "Staff" : "Customer"} account created. Share the email and initial password with the account holder.`,
    }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("A user with this email already exists.", 409);
    return authErrorResponse(error, "users:create");
  } finally {
    client?.release();
  }
}
