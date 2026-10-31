import { NextRequest } from "next/server";
import { z } from "zod";
import pool from "@/lib/db";
import { requireApiUser } from "@/lib/auth/session";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { sendVerificationEmail } from "@/lib/email";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().toLowerCase().email().max(255).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(150).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  role: z.enum(["staff", "customer"]).optional(),
  is_active: z.boolean().optional(),
});

type UserParams = { params: Promise<{ id: string }> };
const publicFields = "id,name,email,phone,company,address,role,is_active,is_verified,created_at,updated_at";

export async function GET(request: NextRequest, context: UserParams) {
  const auth = await requireApiUser(request, ["admin"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return validationError("User was not found.", 404);
  try {
    const result = await pool.query(`SELECT ${publicFields} FROM users WHERE id=$1`, [id]);
    if (!result.rows[0]) return validationError("User was not found.", 404);
    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return authErrorResponse(error, "users:detail");
  }
}

export async function PATCH(request: NextRequest, context: UserParams) {
  const auth = await requireApiUser(request, ["admin"]);
  if (!auth.user) return auth.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return validationError("User was not found.", 404);

  let body: unknown;
  try { body = await request.json(); } catch { return validationError("Request body must be valid JSON."); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "User details are invalid.");
  const input = parsed.data;
  if (!Object.keys(input).length) return validationError("Provide at least one user field to update.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.is_active === false) await client.query("SELECT pg_advisory_xact_lock(hashtextextended('users:deactivate', 0))");
    const found = await client.query("SELECT id,name,email,role,is_active FROM users WHERE id=$1 FOR UPDATE", [id]);
    const current = found.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return validationError("User was not found.", 404);
    }
    if (current.role === "admin" && input.role !== undefined) {
      await client.query("ROLLBACK");
      return validationError("Administrator roles cannot be changed from user management.", 403);
    }
    if (id === auth.user.id && input.is_active === false) {
      await client.query("ROLLBACK");
      return validationError("You cannot deactivate your own account.", 409);
    }
    if (current.role === "admin" && input.is_active === false) {
      const activeAdmins = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND is_active=TRUE");
      if (Number(activeAdmins.rows[0].count) <= 1) {
        await client.query("ROLLBACK");
        return validationError("At least one active administrator must remain.", 409);
      }
    }

    const nextEmail = input.email ?? current.email;
    const emailChanged = nextEmail !== current.email;
    if (emailChanged) {
      const duplicate = await client.query("SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2 LIMIT 1", [nextEmail, id]);
      if (duplicate.rowCount) {
        await client.query("ROLLBACK");
        return validationError("A user with this email already exists.", 409);
      }
    }

    const values: unknown[] = [];
    const sets: string[] = [];
    const add = (field: string, value: unknown) => {
      values.push(value);
      sets.push(`${field}=$${values.length}`);
    };
    if (input.name !== undefined) add("name", input.name);
    if (input.email !== undefined) add("email", nextEmail);
    if (input.phone !== undefined) add("phone", input.phone);
    if (input.company !== undefined) add("company", input.company);
    if (input.address !== undefined) add("address", input.address);
    if (input.role !== undefined) add("role", input.role);
    if (input.is_active !== undefined) add("is_active", input.is_active);

    const code = emailChanged ? generateEmailCode() : null;
    if (emailChanged && code) {
      add("is_verified", false);
      add("verification_code_hash", hashAuthSecret(code));
      sets.push("verification_code_expiry=NOW()+INTERVAL '10 minutes'");
      sets.push("verification_attempts=0");
      sets.push("verification_sent_at=NOW()");
    }
    values.push(id);
    const updated = await client.query(
      `UPDATE users SET ${sets.join(",")},updated_at=NOW() WHERE id=$${values.length} RETURNING ${publicFields}`,
      values,
    );
    if (input.is_active === false || input.role !== undefined || emailChanged) {
      await client.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL", [id]);
    }
    await client.query("COMMIT");

    let message = "User updated.";
    let verificationSent: boolean | undefined;
    if (emailChanged && code) {
      try {
        await sendVerificationEmail({ email: nextEmail, name: updated.rows[0].name, code });
        verificationSent = true;
        message = "User updated. The new email must be verified before sign-in.";
      } catch (emailError) {
        console.error("[users:update:verification-email]", emailError);
        verificationSent = false;
        message = "User updated, but the verification email could not be delivered.";
      }
    }
    return Response.json({ success: true, data: updated.rows[0], message, ...(verificationSent === undefined ? {} : { verificationSent }) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return validationError("A user with this email already exists.", 409);
    return authErrorResponse(error, "users:update");
  } finally {
    client.release();
  }
}
