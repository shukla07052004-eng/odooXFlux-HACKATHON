import { z } from "zod";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { createSessionToken, setSessionCookie, type UserRole } from "@/lib/auth/session";
import { authErrorResponse, validationError } from "@/lib/auth/http";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  identifier: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  password: z.string().min(1, "Password is required").max(72),
}).refine((value) => Boolean(value.email ?? value.identifier), { message: "Email is required", path: ["email"] });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Invalid login details.");
    const email = (parsed.data.email ?? parsed.data.identifier)!.trim().toLowerCase();
    const result = await pool.query(
      `SELECT id, name, email, password_hash, role, is_active, is_verified
         FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      return validationError("Email or password is incorrect.", 401);
    }
    if (!user.is_active) return validationError("This account is inactive. Contact your workspace administrator.", 403);
    if (!user.is_verified) return validationError("Verify your email before signing in.", 403);
    if (!["admin", "staff", "customer"].includes(user.role)) return validationError("This account has an invalid workspace role.", 403);
    const sessionUser = { id: user.id as string, name: user.name as string, email: user.email as string, role: user.role as UserRole };
    const token = await createSessionToken(sessionUser);
    const response = Response.json({ success: true, message: "Signed in successfully.", user: sessionUser });
    return setSessionCookie(response, token);
  } catch (error) {
    return authErrorResponse(error, "login");
  }
}
