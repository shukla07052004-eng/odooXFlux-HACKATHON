import { requireApiUser } from "@/lib/auth/session";

export const instant = false;

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request);
    if (!auth.user) return auth.response;
    return Response.json({ success: true, user: auth.user });
  } catch (error) {
    console.error("[auth:session]", error);
    return Response.json({ success: false, message: "Could not validate the current session." }, { status: 500 });
  }
}
