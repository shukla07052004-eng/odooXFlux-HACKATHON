import { POST as verify } from "../verify/route";

export async function POST(request: Request) {
  const payload = await request.json() as { email?: string; code?: string };
  return verify(new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, purpose: "signup" }),
  }));
}
