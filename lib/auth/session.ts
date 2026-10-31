import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import pool from "@/lib/db";

export const SESSION_COOKIE = "accessToken";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type UserRole = "admin" | "staff" | "customer";
export type SessionUser = { id: string; name: string; email: string; role: UserRole };

function signingKey() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(`Configure AUTH_SECRET or JWT_SECRET with at least 32 characters (received ${secret?.length ?? 0}).`);
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser) {
  const jti = randomUUID();
  const token = await new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(signingKey());
  await pool.query("INSERT INTO auth_sessions(jti,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '12 hours')", [jti, user.id]);
  return token;
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] }));
  } catch (error) {
    if (error instanceof Error && ["JWTExpired", "JWTInvalid", "JWTClaimValidationFailed", "JWSSignatureVerificationFailed"].includes(error.name)) return null;
    throw error;
  }
  if (!payload.sub || !payload.jti) return null;

  const result = await pool.query(
    `SELECT u.id,u.name,u.email,u.role,u.is_active,u.is_verified
       FROM users u JOIN auth_sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND s.jti=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
    [payload.sub, payload.jti],
  );
  const row = result.rows[0];
  if (!row || !row.is_active || !row.is_verified) return null;
  if (!["admin", "staff", "customer"].includes(row.role)) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? readSessionToken(token) : null;
}

export function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
  return response;
}

export function clearSessionCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return response;
}

export async function revokeSessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
    if (payload.sub && payload.jti) await pool.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE jti=$1 AND user_id=$2 AND revoked_at IS NULL", [payload.jti, payload.sub]);
  } catch (error) {
    if (error instanceof Error && ["JWTExpired", "JWTInvalid", "JWTClaimValidationFailed", "JWSSignatureVerificationFailed"].includes(error.name)) return;
    throw error;
  }
}

export async function requireApiUser(request: Request, roles?: UserRole[]) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const user = token ? await readSessionToken(decodeURIComponent(token)) : null;
  if (!user) return { user: null, response: Response.json({ success: false, message: "Authentication required." }, { status: 401 }) };
  if (roles && !roles.includes(user.role)) return { user: null, response: Response.json({ success: false, message: "You do not have permission to perform this action." }, { status: 403 }) };
  return { user, response: null };
}
