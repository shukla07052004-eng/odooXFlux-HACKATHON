'use client';

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";

type Row = { id: string;[key: string]: unknown };
type AccountData = { user: { name: string; email: string; phone?: string | null; company?: string | null; address?: string | null }; subscriptions: Row[]; quotations: Row[]; invoices: Row[]; payments: Row[] };
export default function AccountPage() {
  const [data, setData] = useState<AccountData | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0);
  const [profile, setProfile] = useState({ name: "", phone: "", company: "", address: "" });
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void (async () => { setLoading(true); setError(""); try { const response = await fetch("/api/account", { cache: "no-store", signal: controller.signal }); const result = await response.json() as AccountData & { message?: string }; if (!response.ok) throw new Error(result.message ?? `Account endpoint returned ${response.status}.`); setData(result); setProfile({ name: result.user.name, phone: result.user.phone ?? "", company: result.user.company ?? "", address: result.user.address ?? "" }); } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load your account."); } finally { if (!controller.signal.aborted) setLoading(false); } })(); }, 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [reload]);
  async function saveProfile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); setNotice(""); try { const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) }); const result = await response.json() as { success?: boolean; user?: AccountData["user"]; message?: string }; if (!response.ok || !result.success || !result.user) throw new Error(result.message ?? `Profile update failed (${response.status}).`); setData((current) => current ? { ...current, user: result.user! } : current); setProfile({ name: result.user.name, phone: result.user.phone ?? "", company: result.user.company ?? "", address: result.user.address ?? "" }); setNotice(result.message ?? "Profile updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update your profile."); } finally { setSaving(false); } }
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER PORTAL"
        title="My account"
        description="Review your subscriptions, invoices, and payment balances."
        action={
          <button
            onClick={() => setReload((value) => value + 1)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          {notice}
        </div>
      )}

      {/* Account Profile */}
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5">
        <header className="mb-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Account profile
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {data?.user.email ?? ""}
          </p>
        </header>

        <form
          onSubmit={(event) => void saveProfile(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-1.5 text-xs font-medium text-slate-700">
            Name
            <input
              required
              minLength={2}
              maxLength={150}
              value={profile.name}
              onChange={(event) =>
                setProfile({ ...profile, name: event.target.value })
              }
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-slate-700">
            Phone
            <input
              type="tel"
              maxLength={40}
              value={profile.phone}
              onChange={(event) =>
                setProfile({ ...profile, phone: event.target.value })
              }
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-slate-700">
            Company
            <input
              maxLength={150}
              value={profile.company}
              onChange={(event) =>
                setProfile({ ...profile, company: event.target.value })
              }
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-slate-700 sm:col-span-2">
            Address
            <textarea
              maxLength={1000}
              rows={2}
              value={profile.address}
              onChange={(event) =>
                setProfile({ ...profile, address: event.target.value })
              }
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              disabled={saving || loading}
              className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </section>

      {/* Customer Records */}
      <div className="grid gap-5 xl:grid-cols-2">
        {[
          {
            title: "Subscriptions",
            rows: data?.subscriptions ?? [],
            ref: "subscription_number",
            date: "expiry_date",
            amount: "",
            empty: "No subscriptions are associated with your account.",
          },
          {
            title: "Quotations",
            rows: data?.quotations ?? [],
            ref: "quotation_number",
            date: "valid_until",
            amount: "total_amount",
            empty: "No quotations are associated with your account.",
          },
          {
            title: "Invoices",
            rows: data?.invoices ?? [],
            ref: "invoice_number",
            date: "due_date",
            amount: "total_amount",
            empty: "No invoices are associated with your account.",
          },
          {
            title: "Payments",
            rows: data?.payments ?? [],
            ref: "invoice_number",
            date: "payment_date",
            amount: "amount",
            empty: "No payments are associated with your account.",
          },
        ].map((section) => (
          <section
            key={section.title}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <header className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold">{section.title}</h2>
            </header>

            {loading ? (
              <p className="p-5 text-sm text-slate-500">Loading…</p>
            ) : section.rows.length ? (
              <div className="divide-y divide-slate-100">
                {section.rows.map((row) => (
                  <article
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <b className="text-sm">
                        {String(row[section.ref] ?? row.id)}
                      </b>

                      <p className="mt-1 text-xs text-slate-500">
                        {section.title === "Subscriptions"
                          ? String(row.plan_name ?? "Plan")
                          : section.title === "Payments"
                            ? `${String(row.payment_method ?? "Payment")} · ${formatDate(row[section.date])}`
                            : `${section.title === "Quotations" ? "Valid until" : "Due"} · ${formatDate(row[section.date])}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {section.amount && (
                        <b className="text-sm">
                          {formatCurrency(row[section.amount])}
                        </b>
                      )}

                      <StatusBadge
                        status={String(row.status ?? "Recorded")}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-slate-500">
                {section.empty}
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
