import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/protected-shell";
import { getSessionUser } from "@/lib/auth/session";

export const instant = false;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return <ProtectedShell user={user}>{children}</ProtectedShell>;
}
