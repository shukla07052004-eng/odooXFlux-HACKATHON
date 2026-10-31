import { clearSessionCookie, revokeSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await revokeSessionToken(decodeURIComponent(token));
  const response = Response.json({ success: true, message: "Signed out successfully." });
  return clearSessionCookie(response);
}
