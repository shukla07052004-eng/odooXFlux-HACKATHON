import { POST as verify } from "../verify/route";

export async function POST(request: Request) {
  const payload = await request.json() as { email?: string; identifier?: string; validCode?: string };
  return verify(new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: payload.email ?? payload.identifier, code: payload.validCode, purpose: "password_reset" }),
  }));
}
