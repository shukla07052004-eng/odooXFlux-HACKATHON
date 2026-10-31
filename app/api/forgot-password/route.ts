import { z } from "zod";
import pool from "@/lib/db";
import { generateResetToken, hashAuthSecret } from "@/lib/auth/codes";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { sendPasswordResetLink } from "@/lib/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") });
const genericMessage = "If an active account matches that email, a password reset link will be sent.";

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    const email = parsed.data.email;
    const found = await pool.query("SELECT id, name, is_active, is_verified, password_reset_requested_at FROM users WHERE LOWER(email) = $1", [email]);
    const user = found.rows[0];
    if (!user || !user.is_active || !user.is_verified) return Response.json({ success: true, message: genericMessage });
    if (user.password_reset_requested_at && Date.now() - new Date(user.password_reset_requested_at).getTime() < 60_000) {
      return Response.json({ success: true, message: genericMessage });
    }
    const token = generateResetToken();
    await pool.query(
      `UPDATE users SET password_reset_token_hash = $1,
           password_reset_token_expiry = NOW() + INTERVAL '60 minutes', password_reset_requested_at = NOW()
       WHERE id = $2`,
      [hashAuthSecret(token), user.id],
    );
    try {
      const configuredOrigin = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
      const resetUrl = new URL("/reset-password", configuredOrigin);
      resetUrl.searchParams.set("token", token);
      await sendPasswordResetLink({ email, name: user.name, resetUrl: resetUrl.toString() });
    } catch (error) {
      console.error("[auth:forgot-password:email]", error);
      return Response.json({ success: false, message: "The reset email could not be delivered. Check the email provider configuration and try again." }, { status: 502 });
    }
    return Response.json({ success: true, message: genericMessage });
  } catch (error) {
    return authErrorResponse(error, "forgot-password");
  }
}
