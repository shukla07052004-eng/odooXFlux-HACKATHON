import { z } from "zod";
import pool from "@/lib/db";
import { generateEmailCode, generateResetToken, hashAuthSecret, matchesAuthSecret } from "@/lib/auth/codes";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { sendVerificationEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/).optional(),
  purpose: z.enum(["signup", "password_reset"]).default("signup"),
  mode: z.enum(["verify", "resend"]).default("verify"),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError("Enter a valid email and 6-digit verification code.");
    const { email, purpose, mode } = parsed.data;

    if (mode === "resend") {
      if (purpose !== "signup") return validationError("Request password reset codes from the forgot-password form.");
      const found = await pool.query("SELECT id, name, is_verified, is_active, verification_sent_at FROM users WHERE LOWER(email) = $1", [email]);
      const user = found.rows[0];
      if (!user) return validationError("No account is waiting for verification with this email.", 404);
      if (user.is_verified) return validationError("This email is already verified. Please sign in.", 409);
      if (!user.is_active) return validationError("This account is inactive. Contact your workspace administrator.", 403);
      if (user.verification_sent_at && Date.now() - new Date(user.verification_sent_at).getTime() < 60_000) return validationError("A code was sent recently. Please wait a minute before requesting another.", 429);
      const code = generateEmailCode();
      await pool.query(`UPDATE users SET verification_code_hash = $1, verification_code_expiry = NOW() + INTERVAL '10 minutes', verification_attempts = 0, verification_sent_at = NOW() WHERE id = $2`, [hashAuthSecret(code), user.id]);
      await sendVerificationEmail({ email, name: user.name, code });
      return Response.json({ success: true, message: "A new verification code has been sent." });
    }

    const code = parsed.data.code;
    if (!code) return validationError("A 6-digit code is required.");
    const result = await pool.query(
      `SELECT id, is_verified, is_active, verification_code_hash, verification_code_expiry, verification_attempts
         FROM users WHERE LOWER(email) = $1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !user.is_active) return validationError("The code is invalid or expired.", 400);
    if (purpose === "signup" && user.is_verified) return Response.json({ success: true, message: "Email is already verified." });
    if (!user.verification_code_hash || !user.verification_code_expiry) return validationError("The code is invalid or expired. Request a new one.", 400);
    if (Number(user.verification_attempts) >= 5) return validationError("Too many incorrect attempts. Request a new code.", 429);
    if (new Date(user.verification_code_expiry).getTime() <= Date.now()) {
      await pool.query("UPDATE users SET verification_code_hash = NULL, verification_code_expiry = NULL, verification_attempts = 0 WHERE id = $1", [user.id]);
      return validationError("The code has expired. Request a new one.", 410);
    }
    if (!matchesAuthSecret(code, user.verification_code_hash)) {
      await pool.query("UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = $1", [user.id]);
      return validationError("The verification code is incorrect.", 400);
    }

    if (purpose === "signup") {
      await pool.query(
        `UPDATE users SET is_verified = TRUE, verification_code_hash = NULL,
             verification_code_expiry = NULL, verification_attempts = 0, updated_at = NOW()
         WHERE id = $1`,
        [user.id],
      );
      return Response.json({ success: true, message: "Email verified. You can now sign in." });
    }

    const resetToken = generateResetToken();
    await pool.query(
      `UPDATE users SET password_reset_token_hash = $1,
           password_reset_token_expiry = NOW() + INTERVAL '10 minutes',
           verification_code_hash = NULL, verification_code_expiry = NULL, verification_attempts = 0
       WHERE id = $2`,
      [hashAuthSecret(resetToken), user.id],
    );
    return Response.json({ success: true, message: "Code verified. Set your new password.", resetToken });
  } catch (error) {
    return authErrorResponse(error, "verify");
  }
}
