'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, CreditCard, FileText, LayoutDashboard, Layers3, Percent, ReceiptText, Settings, Users, X } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Products", href: "/products", icon: Boxes },
  { label: "Plans", href: "/plans", icon: Layers3 },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Subscriptions", href: "/subscriptions", icon: ReceiptText },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Discounts", href: "/discounts", icon: Percent },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Users", href: "/users", icon: Users },
];

export function Sidebar({ open, onClose, user }: { open: boolean; onClose: () => void; user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const visibleNavigation = user.role === "customer"
    ? [{ label: "My account", href: "/account", icon: Users }]
    : navigation.filter((item) => user.role === "admin" || !["/discounts", "/reports", "/settings", "/users"].includes(item.href));

  async function logout() {
    setLoggingOut(true); setLogoutError("");
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error(`Sign out failed (${response.status}).`);
      router.replace("/sign-in"); router.refresh();
    } catch (error) { setLogoutError(error instanceof Error ? error.message : "Unable to sign out."); }
    finally { setLoggingOut(false); }
  }
  return <>
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 transition-transform md:translate-x-0 ${open ? "translate-x-0 shadow-xl" : "-translate-x-full"}`}>
      <div className="mb-7 flex items-center justify-between px-2"><Link href={user.role === "customer" ? "/account" : "/dashboard"} onClick={onClose} className="flex items-center gap-2.5"><span className="grid h-8 w-8 grid-cols-2 gap-1 rounded-lg bg-indigo-600 p-1.5"><i className="rounded-sm bg-white"/><i className="rounded-sm bg-white/70"/><i className="rounded-sm bg-white/50"/><i className="rounded-sm bg-white"/></span><span><b className="block text-sm font-bold tracking-tight text-slate-900">brightloop</b><small className="block text-[9px] font-semibold uppercase tracking-[.18em] text-slate-400">software</small></span></Link><button onClick={onClose} aria-label="Close navigation" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"><X className="h-4 w-4"/></button></div>
      <button className="mb-6 flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 text-left"><span className="grid h-8 w-8 place-items-center rounded-md bg-indigo-50 text-sm font-bold text-indigo-700">B</span><span className="min-w-0 flex-1"><b className="block truncate text-xs font-semibold text-slate-800">Brightloop Software</b><small className="mt-0.5 block text-[10px] text-slate-500">Business workspace</small></span><span className="text-slate-400">⌄</span></button>
      <p className="mb-2 px-2 text-[10px] font-semibold tracking-[.12em] text-slate-400">WORKSPACE</p>
      <nav aria-label="Main navigation" className="flex flex-col gap-1">{visibleNavigation.map(({ label, href, icon: Icon }) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} onClick={onClose} aria-current={active ? "page" : undefined} className={`flex h-10 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-[17px] w-[17px]" strokeWidth={1.8}/>{label}</Link>; })}</nav>
      <div className="mt-auto rounded-lg border border-slate-200 p-3"><b className="text-xs text-slate-800">Need a hand?</b><p className="mb-2 mt-1 text-[11px] text-slate-500">Visit our help center for billing guidance.</p><a href="mailto:support@brightloop.example" className="text-xs font-semibold text-indigo-600">Contact support ↗</a></div>
      <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 px-1 pt-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-[10px] font-bold uppercase text-amber-800">{user.name.slice(0, 2)}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs font-semibold text-slate-800">{user.name}</b><small className="capitalize text-[10px] text-slate-500">{user.role}</small></span><button onClick={logout} disabled={loggingOut} className="text-xs font-medium text-slate-500 hover:text-rose-600 disabled:opacity-50">{loggingOut ? "…" : "Sign out"}</button></div>
      {logoutError && <p role="alert" className="mt-2 text-xs text-rose-600">{logoutError}</p>}
    </aside>
    {open && <button className="fixed inset-0 z-30 bg-slate-950/25 md:hidden" aria-label="Close navigation overlay" onClick={onClose}/>}
  </>;
}
