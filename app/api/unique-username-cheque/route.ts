export async function POST() {
  return Response.json({ success: false, message: "Username availability checks are no longer used; the workspace identifies accounts by email." }, { status: 410 });
}
