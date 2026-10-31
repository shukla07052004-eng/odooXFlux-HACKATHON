import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProtectedShell } from "@/components/layout/protected-shell";
import { getSessionUser } from "@/lib/auth/session";

export const instant = false;

async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return <ProtectedShell user={user}>{children}</ProtectedShell>;
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <main
          className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"
          role="status"
        >
          Loading your workspace…
        </main>
      }
    >
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </Suspense>
  );
}
