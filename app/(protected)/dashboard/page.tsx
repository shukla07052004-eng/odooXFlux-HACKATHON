'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CreditCard, FileWarning, RefreshCw, Wallet } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { BillingRecord } from "@/types/billing";

type DashboardData = {
  active_subscriptions: number;
  collected_revenue: number;
  outstanding_amount: number;
  overdue_invoices: number;
  status_distribution: Array<{ status: string; count: number }>;
  revenue_by_month: Array<{ month: string; amount: number }>;
  subscriptions_by_month: Array<{ month: string; count: number }>;
  recent_invoices: BillingRecord[];
  recent_payments: BillingRecord[];
  upcoming_renewals: BillingRecord[];
};
const emptyDashboard: DashboardData = { active_subscriptions: 0, collected_revenue: 0, outstanding_amount: 0, overdue_invoices: 0, status_distribution: [], revenue_by_month: [], subscriptions_by_month: [], recent_invoices: [], recent_payments: [], upcoming_renewals: [] };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/reports/summary", { cache: "no-store" })
      .then(async (response) => { const result = await response.json() as { data?: DashboardData; message?: string }; if (!response.ok || !result.data) throw new Error(result.message ?? `Dashboard summary returned ${response.status}.`); return result.data; })
      .then((summary) => { if (active) setData(summary); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Dashboard data is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const revenue = Number(data.collected_revenue);
  const maxBar = Math.max(...data.revenue_by_month.map((bar) => Number(bar.amount)), 1);
  const subscriptionsTotal = data.status_distribution.reduce((sum, row) => sum + Number(row.count), 0);

  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE OVERVIEW"
        title="Dashboard"
        description="A live view of recurring revenue and billing activity."
        action={
          <button
            onClick={() => {
              setLoading(true);
              setError("");
              setReloadKey((key) => key + 1);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {/* Error State */}
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setError("");
            setReloadKey((key) => key + 1);
          }}
        />
      )}

      {/* Dashboard KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Collected revenue",
            value: formatCurrency(revenue),
            note: "Recorded payments",
            icon: Wallet,
            tint: "bg-indigo-50 text-indigo-600",
          },
          {
            label: "Active subscriptions",
            value: String(data.active_subscriptions),
            note: "Current active agreements",
            icon: RefreshCw,
            tint: "bg-emerald-50 text-emerald-700",
          },
          {
            label: "Outstanding amount",
            value: formatCurrency(data.outstanding_amount),
            note: "Across open invoices",
            icon: CreditCard,
            tint: "bg-amber-50 text-amber-700",
          },
          {
            label: "Overdue invoices",
            value: String(data.overdue_invoices),
            note: "Needs follow-up",
            icon: FileWarning,
            tint: "bg-rose-50 text-rose-600",
          },
        ].map(({ label, value, note, icon: Icon, tint }) => (
          <article
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{label}</span>

              <span
                className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>

            <strong className="mt-3 block text-2xl font-semibold tracking-tight text-slate-900">
              {loading ? "—" : value}
            </strong>

            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </article>
        ))}
      </div>

      {/* Dashboard Analytics */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">

        {/* Payments Collected Chart */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Payments collected
              </h2>

            <p className="mt-1 text-xs text-slate-500">
                Collected payments by month · last six months
              </p>
            </div>

            <span className="text-sm font-semibold text-slate-800">
              {formatCurrency(revenue)}
            </span>
          </div>

          <div className="mt-7 grid h-52 grid-cols-6 items-end gap-3">
            {data.revenue_by_month.map((bar) => (
              <div
                key={bar.month}
                className="flex h-full flex-col items-center justify-end gap-2"
              >
                <div
                  title={formatCurrency(bar.amount)}
                  className="w-full max-w-12 rounded-t-md bg-indigo-500/85 transition-all"
                  style={{
                    height: `${Math.max(5, (Number(bar.amount) / maxBar) * 100)}%`,
                  }}
                />

                <span className="text-[10px] text-slate-400">
                  {bar.month}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Revenue totals are aggregated in PostgreSQL
          </div>
        </section>

        {/* Subscription Health */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Subscription health
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Current status mix
              </p>
            </div>

            <Link href="/subscriptions" className="text-indigo-600">
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {["Active", "Paused", "Closed", "Draft"].map((status) => {
              const count = Number(data.status_distribution.find((row) => row.status.toLowerCase() === status.toLowerCase())?.count ?? 0);

              const ratio = subscriptionsTotal
                ? (count / subscriptionsTotal) * 100
                : 0;

              return (
                <div key={status}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-slate-600">{status}</span>
                    <b className="text-slate-800">{count}</b>
                  </div>

                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-indigo-500"
                  style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-5 text-xs text-slate-400">
            {subscriptionsTotal} subscriptions
          </p>
        </section>

        {/* Recent Invoices */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Recent invoices
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Latest billing activity
              </p>
            </div>

            <Link
              href="/invoices"
              className="text-xs font-semibold text-indigo-600"
            >
              View invoices
              <ArrowUpRight className="inline h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <p className="p-5 text-sm text-slate-500">
              Loading invoice activity…
            </p>
          ) : data.recent_invoices.length ? (
            <div className="divide-y divide-slate-100">
              {data.recent_invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <b className="block text-sm font-medium text-slate-800">
                      {String(
                        invoice.customer_name ??
                        invoice.customer ??
                        invoice.invoice_number ??
                        invoice.id
                      )}
                    </b>

                    <small className="mt-1 block text-xs text-slate-500">
                      {String(invoice.invoice_number ?? invoice.id)} ·{" "}
                      {formatDate(invoice.invoice_date ?? invoice.date)}
                    </small>
                  </div>

                  <div className="flex items-center gap-4">
                    <b className="text-sm tabular-nums text-slate-900">
                      {formatCurrency(
                        invoice.total_amount ?? invoice.amount
                      )}
                    </b>

                    <StatusBadge
                      status={String(invoice.status ?? "Draft")}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No invoices returned by the API yet.
            </p>
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Recent payments</h2>
          {data.recent_payments.length ? <div className="mt-3 divide-y divide-slate-100">{data.recent_payments.map((payment) => <div key={payment.id} className="flex justify-between gap-3 py-2 text-sm"><span className="truncate text-slate-600">{String(payment.customer_name ?? payment.invoice_number ?? "Payment")} · {formatDate(payment.payment_date)}</span><b>{formatCurrency(payment.amount)}</b></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No payments recorded yet.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Upcoming renewals</h2>
          {data.upcoming_renewals.length ? <div className="mt-3 divide-y divide-slate-100">{data.upcoming_renewals.map((renewal) => <div key={renewal.id} className="flex justify-between gap-3 py-2 text-sm"><span className="truncate text-slate-600">{String(renewal.customer_name ?? renewal.subscription_number)}</span><span className="shrink-0 text-slate-500">{formatDate(renewal.expiry_date)}</span></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No renewals due in the next 30 days.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Subscription growth</h2>
          <div className="mt-4 grid h-32 grid-cols-6 items-end gap-3">{data.subscriptions_by_month.map((month) => { const max = Math.max(...data.subscriptions_by_month.map((entry) => Number(entry.count)), 1); return <div key={month.month} className="flex h-full flex-col items-center justify-end gap-2"><div title={`${month.count} subscriptions`} className="w-full max-w-12 rounded-t-md bg-emerald-500/85" style={{ height: `${Math.max(5, Number(month.count) / max * 100)}%` }} /><span className="text-[10px] text-slate-400">{month.month}</span></div>; })}</div>
        </section>
      </div>
    </>
  );
}

