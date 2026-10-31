import { z } from "zod";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { hashAuthSecret } from "@/lib/auth/codes";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const passwordSchema = z.string().min(9, "Password must be more than 8 characters").max(72, "Password is too long")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");
const schema = z.object({ resetToken: z.string().min(20), password: passwordSchema });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Enter a valid reset token and password.");
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const client = await pool.connect();
    let userId: string | undefined;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE users SET password_hash = $1, password_reset_token_hash = NULL,
             password_reset_token_expiry = NULL, updated_at = NOW()
         WHERE password_reset_token_hash = $2 AND password_reset_token_expiry > NOW()
           AND is_active = TRUE AND is_verified = TRUE
         RETURNING id`,
        [passwordHash, hashAuthSecret(parsed.data.resetToken)],
      );
      userId = result.rows[0]?.id;
      if (!userId) { await client.query("ROLLBACK"); return validationError("The reset token is invalid or expired. Request another code.", 400); }
      await client.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
    return Response.json({ success: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    return authErrorResponse(error, "reset-password");
  }
}
