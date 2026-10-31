'use client';

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import type { BillingRecord } from "@/types/billing";
import { formatCurrency, formatDate, parseApiList } from "@/lib/format";

type Summary = { collected_revenue: number | string; active_subscriptions: number; outstanding_amount: number | string; outstanding_invoices: number; overdue_invoices: number; payment_count: number };
export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary>({ collected_revenue: 0, active_subscriptions: 0, outstanding_amount: 0, outstanding_invoices: 0, overdue_invoices: 0, payment_count: 0 });
  const [payments, setPayments] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [reload, setReload] = useState(0); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const filters = new URLSearchParams(); if (from) filters.set("from", from); if (to) filters.set("to", to);
      const [summaryResponse, paymentResponse] = await Promise.all([fetch(`/api/reports/summary?${filters}`, { cache: "no-store" }), fetch(`/api/payments?page=1&pageSize=100&${filters}`, { cache: "no-store" })]);
      if (!summaryResponse.ok || !paymentResponse.ok) throw new Error(`Report API returned ${!summaryResponse.ok ? summaryResponse.status : paymentResponse.status}.`);
      const summaryPayload = await summaryResponse.json() as { data: Summary };
      setSummary(summaryPayload.data); setPayments(await parseApiList<BillingRecord>(paymentResponse));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load reports."); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  function exportPayments() {
    const lines = [["Payment", "Invoice", "Customer", "Date", "Method", "Amount"], ...payments.map((row) => [row.payment_number, row.invoice_number, row.customer_name, row.payment_date, row.payment_method, row.amount])].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" })); link.download = "brightloop-payments-report.csv"; link.click(); URL.revokeObjectURL(link.href);
  }
  const reports = [
    { title: "Revenue report", description: "Collected payments in the selected period.", value: formatCurrency(summary.collected_revenue) },
    { title: "Active subscriptions", description: "Current active customer agreements.", value: String(summary.active_subscriptions) },
    { title: "Outstanding invoices", description: `${summary.outstanding_invoices} open invoices · ${formatCurrency(summary.outstanding_amount)} balance`, value: String(summary.outstanding_invoices) },
    { title: "Overdue invoices", description: "Unpaid confirmed or sent invoices past due.", value: String(summary.overdue_invoices) },
    { title: "Payment report", description: "Payments recorded in the selected period.", value: `${summary.payment_count} payments` },
  ];
  return <>
    <PageHeader eyebrow="ANALYTICS" title="Reports" description="Review billing performance using database summaries and export payment activity." action={<button onClick={() => setReload((key) => key + 1)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm"><RefreshCw className="h-4 w-4"/>Refresh</button>} />
    <section className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="grid gap-1 text-xs font-medium text-slate-600">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border border-slate-200 px-3 text-sm"/></label>
      <label className="grid gap-1 text-xs font-medium text-slate-600">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border border-slate-200 px-3 text-sm"/></label>
      <button onClick={() => { setFrom(""); setTo(""); }} className="h-9 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-50">Clear dates</button>
      <button onClick={exportPayments} disabled={!payments.length} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Download className="h-4 w-4"/>Export payments CSV</button>
    </section>
    {error && <ErrorState message={error} onRetry={() => setReload((key) => key + 1)} />}
    <div className="grid gap-4 lg:grid-cols-2">{reports.map((report) => <article key={report.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">{report.title}</h2><p className="mt-1 text-xs text-slate-500">{report.description}</p></div><b className="text-lg tabular-nums text-slate-900">{loading ? "—" : report.value}</b></div><div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{loading ? "Loading report…" : `Dates ${from || "any"} to ${to || "today"}`}</div></article>)}</div>
    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Payment activity</h2><p className="mt-1 text-xs text-slate-500">Most recent matching payments · export includes up to 100 records</p></header>
      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr>{["Payment", "Customer", "Date", "Method", "Amount"].map((name) => <th key={name} className="px-5 py-3">{name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{payments.slice(0, 8).map((row) => <tr key={row.id}><td className="px-5 py-3">{String(row.payment_number ?? row.id)}</td><td className="px-5 py-3">{String(row.customer_name ?? "—")}</td><td className="px-5 py-3">{formatDate(row.payment_date)}</td><td className="px-5 py-3">{String(row.payment_method ?? "—")}</td><td className="px-5 py-3 font-medium">{formatCurrency(row.amount)}</td></tr>)}</tbody></table>{!loading && !payments.length && <p className="p-8 text-center text-sm text-slate-500">No payment activity in this date range.</p>}</div>
    </section>
  </>;
}
