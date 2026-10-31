import { z } from "zod";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { sendVerificationEmail } from "@/lib/email";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");
const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(150).optional(),
  username: z.string().trim().min(2, "Name must be at least 2 characters").max(150).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  password: passwordSchema,
}).refine((value) => Boolean(value.name ?? value.username), { message: "Name is required", path: ["name"] });

export async function POST(request: Request) {
  let client;
  try {
    const body: unknown = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Invalid signup details.");

    const email = parsed.data.email;
    const name = (parsed.data.name ?? parsed.data.username)!.trim();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const code = generateEmailCode();
    const codeHash = hashAuthSecret(code);
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [email]);
    const existing = await client.query(
      "SELECT id, is_verified, is_active, verification_sent_at FROM users WHERE LOWER(email) = $1 FOR UPDATE",
      [email],
    );
    if (existing.rows[0]?.is_verified) {
      await client.query("ROLLBACK");
      return validationError("An account with this email already exists. Sign in instead.", 409);
    }
    const sentAt = existing.rows[0]?.verification_sent_at as Date | undefined;
    if (sentAt && Date.now() - new Date(sentAt).getTime() < 60_000) {
      await client.query("ROLLBACK");
      return validationError("A verification code was sent recently. Please wait a minute before requesting another.", 429);
    }
    if (existing.rows[0]) {
      if (!existing.rows[0].is_active) {
        await client.query("ROLLBACK");
        return validationError("This account is inactive. Contact your workspace administrator.", 403);
      }
      await client.query(
        `UPDATE users SET name = $1, password_hash = $2,
             verification_code_hash = $3, verification_code_expiry = NOW() + INTERVAL '10 minutes',
             verification_attempts = 0, verification_sent_at = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [name, passwordHash, codeHash, existing.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, is_active, is_verified,
             verification_code_hash, verification_code_expiry, verification_attempts, verification_sent_at)
         VALUES ($1, $2, $3, 'customer', TRUE, FALSE, $4, NOW() + INTERVAL '10 minutes', 0, NOW())`,
        [name, email, passwordHash, codeHash],
      );
    }
    await client.query("COMMIT");
    await sendVerificationEmail({ email, name, code });
    return Response.json({ success: true, message: "Account created. Check your email for the verification code." }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return validationError("An account with this email already exists. Sign in instead.", 409);
    }
    return authErrorResponse(error, "signup");
  } finally {
    client?.release();
  }
}
