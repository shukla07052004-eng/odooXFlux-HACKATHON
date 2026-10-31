'use client';

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { SessionUser } from "@/lib/auth/session";

const titles: Record<string, string> = { account: "My account", dashboard: "Dashboard", customers: "Customers", products: "Products", plans: "Plans", quotations: "Quotations", subscriptions: "Subscriptions", invoices: "Invoices", payments: "Payments", discounts: "Discounts", reports: "Reports", settings: "Settings", users: "User management" };

export function ProtectedShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = titles[pathname.split("/")[1] ?? "dashboard"] ?? "Workspace";
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
      />

      <div className="min-h-screen md:pl-64">
        <Topbar
          title={title}
          onMenu={() => setMenuOpen(true)}
          user={user}
        />

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-4 text-[11px] text-slate-400 sm:px-6 lg:px-8">
          <span>© 2026 Brightloop Software</span>

          <span>
            <i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            All systems operational
          </span>
        </footer>
      </div>
    </div>
  );
}
