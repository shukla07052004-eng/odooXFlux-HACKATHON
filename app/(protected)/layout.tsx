import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/protected-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  // This is a workspace UI guard; API handlers must authorize every request independently.
  if (!cookieStore.has("accessToken")) redirect("/sign-up");
  return <ProtectedShell>{children}</ProtectedShell>;
}
