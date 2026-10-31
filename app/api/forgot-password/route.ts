import { z } from "zod";
import pool from "@/lib/db";
import { generateEmailCode, hashAuthSecret } from "@/lib/auth/codes";
import { authErrorResponse, validationError } from "@/lib/auth/http";
import { sendPasswordResetEmail } from "@/lib/email";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") });
const genericMessage = "If an active account matches that email, a password reset code will be sent.";

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
    const email = parsed.data.email;
    const found = await pool.query("SELECT id, name, is_active, is_verified, verification_sent_at FROM users WHERE LOWER(email) = $1", [email]);
    const user = found.rows[0];
    if (!user || !user.is_active || !user.is_verified) return Response.json({ success: true, message: genericMessage });
    if (user.verification_sent_at && Date.now() - new Date(user.verification_sent_at).getTime() < 60_000) {
      return Response.json({ success: true, message: genericMessage });
    }
    const code = generateEmailCode();
    await pool.query(
      `UPDATE users SET verification_code_hash = $1,
           verification_code_expiry = NOW() + INTERVAL '10 minutes',
           verification_attempts = 0, verification_sent_at = NOW()
       WHERE id = $2`,
      [hashAuthSecret(code), user.id],
    );
    try {
      await sendPasswordResetEmail({ email, name: user.name, code });
    } catch (error) {
      console.error("[auth:forgot-password:email]", error);
      return Response.json({ success: false, message: "The reset email could not be delivered. Check the email provider configuration and try again." }, { status: 502 });
    }
    return Response.json({ success: true, message: genericMessage });
  } catch (error) {
    return authErrorResponse(error, "forgot-password");
  }
}
