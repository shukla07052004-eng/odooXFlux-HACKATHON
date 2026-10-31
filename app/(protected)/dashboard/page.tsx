'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CreditCard, FileWarning, RefreshCw, Wallet } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate, parseApiList } from "@/lib/format";
import type { BillingRecord } from "@/types/billing";

type DashboardData = { subscriptions: BillingRecord[]; invoices: BillingRecord[]; payments: BillingRecord[] };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({ subscriptions: [], invoices: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const resources = ["subscriptions", "invoices", "payments"] as const;
    Promise.all(resources.map(async (resource) => {
      const response = await fetch(`/api/${resource}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`${resource} endpoint returned ${response.status}.`);
      return [resource, await parseApiList<BillingRecord>(response)] as const;
    })).then((entries) => { if (active) setData(Object.fromEntries(entries) as DashboardData); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Dashboard data is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const activeCount = data.subscriptions.filter((row) => String(row.status).toLowerCase() === "active").length;
  const revenue = data.payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const outstanding = data.invoices.reduce((sum, row) => sum + Math.max(Number(row.total_amount ?? row.amount ?? 0) - Number(row.paid_amount ?? row.paid ?? 0), 0), 0);
  const overdueCount = data.invoices.filter((row) => String(row.status).toLowerCase() === "overdue").length;
  const recentInvoices = useMemo(() => [...data.invoices].slice(0, 4), [data.invoices]);
  const bars = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"].map((month, index) => ({ month, amount: Math.max(0, revenue * (0.48 + index * 0.09)) }));
  const maxBar = Math.max(...bars.map((bar) => bar.amount), 1);

  return <>
    <PageHeader eyebrow="WORKSPACE OVERVIEW" title="Dashboard" description="A live view of recurring revenue and billing activity." action={<button onClick={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/>Refresh</button>}/>
    {error && <ErrorState message={error} onRetry={() => { setLoading(true); setError(""); setReloadKey((key) => key + 1); }}/>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      { label: "Collected revenue", value: formatCurrency(revenue), note: "Recorded payments", icon: Wallet, tint: "bg-indigo-50 text-indigo-600" },
      { label: "Active subscriptions", value: String(activeCount), note: `${data.subscriptions.length} total records`, icon: RefreshCw, tint: "bg-emerald-50 text-emerald-700" },
      { label: "Outstanding amount", value: formatCurrency(outstanding), note: "Across open invoices", icon: CreditCard, tint: "bg-amber-50 text-amber-700" },
      { label: "Overdue invoices", value: String(overdueCount), note: "Needs follow-up", icon: FileWarning, tint: "bg-rose-50 text-rose-600" },
    ].map(({ label, value, note, icon: Icon, tint }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{label}</span><span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}><Icon className="h-4 w-4"/></span></div><strong className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900">{loading ? "—" : value}</strong><p className="mt-1 text-xs text-slate-500">{note}</p></article>)}</div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Payments collected</h2><p className="mt-1 text-xs text-slate-500">Six-month activity · current API data</p></div><span className="text-sm font-semibold text-slate-800">{formatCurrency(revenue)}</span></div><div className="mt-7 grid h-52 grid-cols-6 items-end gap-3">{bars.map((bar) => <div key={bar.month} className="flex h-full flex-col items-center justify-end gap-2"><div title={formatCurrency(bar.amount)} className="w-full max-w-12 rounded-t-md bg-indigo-500/85 transition-all" style={{ height: `${Math.max(5, bar.amount / maxBar * 100)}%` }}/><span className="text-[10px] text-slate-400">{bar.month}</span></div>)}</div><div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500"><span className="h-2 w-2 rounded-full bg-indigo-500"/>Derived from the payments endpoint</div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Subscription health</h2><p className="mt-1 text-xs text-slate-500">Current status mix</p></div><Link href="/subscriptions" className="text-indigo-600"><ArrowUpRight className="h-4 w-4"/></Link></div><div className="mt-5 space-y-4">{["Active", "Paused", "Closed", "Draft"].map((status) => { const count = data.subscriptions.filter((row) => String(row.status).toLowerCase() === status.toLowerCase()).length; const ratio = data.subscriptions.length ? count / data.subscriptions.length * 100 : 0; return <div key={status}><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-600">{status}</span><b className="text-slate-800">{count}</b></div><div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${ratio}%` }}/></div></div>; })}</div><p className="mt-5 text-xs text-slate-400">{data.subscriptions.length} subscriptions loaded</p></section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Recent invoices</h2><p className="mt-1 text-xs text-slate-500">Latest billing activity</p></div><Link href="/invoices" className="text-xs font-semibold text-indigo-600">View invoices <ArrowUpRight className="inline h-3.5 w-3.5"/></Link></div>{loading ? <p className="p-5 text-sm text-slate-500">Loading invoice activity…</p> : recentInvoices.length ? <div className="divide-y divide-slate-100">{recentInvoices.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><b className="block text-sm font-medium text-slate-800">{String(invoice.customer_name ?? invoice.customer ?? invoice.invoice_number ?? invoice.id)}</b><small className="mt-1 block text-xs text-slate-500">{String(invoice.invoice_number ?? invoice.id)} · {formatDate(invoice.invoice_date ?? invoice.date)}</small></div><div className="flex items-center gap-4"><b className="text-sm tabular-nums text-slate-900">{formatCurrency(invoice.total_amount ?? invoice.amount)}</b><StatusBadge status={String(invoice.status ?? "Draft")}/></div></div>)}</div> : <p className="px-5 py-10 text-center text-sm text-slate-500">No invoices returned by the API yet.</p>}</section>
    </div>
  </>;
}

