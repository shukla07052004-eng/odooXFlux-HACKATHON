'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { formatCurrency } from "@/lib/format";

const fields: FormFieldDefinition[] = [{ key: "invoice_id", label: "Invoice ID", required: true }, { key: "payment_method", label: "Payment method", options: ["Cash", "Bank Transfer", "UPI", "Card"] }, { key: "amount", label: "Amount (₹)", type: "number", required: true }, { key: "payment_date", label: "Payment date", type: "date", required: true }, { key: "notes", label: "Notes", type: "textarea" }];
const columns = [{ key: "payment_number", label: "Payment" }, { key: "invoice_number", label: "Invoice" }, { key: "customer_name", label: "Customer" }, { key: "payment_date", label: "Date", format: "date" as const }, { key: "payment_method", label: "Method" }, { key: "amount", label: "Amount", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];

export default function PaymentsPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [page, setPage] = useState(1); const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 }); const [summary, setSummary] = useState({ total: 0, amount: 0 }); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/payments?page=${page}&pageSize=50`, { cache: "no-store" }); if (!response.ok) throw new Error(`Payments API returned ${response.status}.`); const payload=await response.json() as {data?:BillingRecord[];pagination?:typeof pagination;summary?:typeof summary}; setRows(payload.data??[]); setPagination(payload.pagination??{page,pageSize:50,total:payload.data?.length??0,totalPages:1}); setSummary(payload.summary??{total:payload.data?.length??0,amount:(payload.data??[]).reduce((sum,row)=>sum+Number(row.amount??0),0)}); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load payments."); } finally { setLoading(false); } }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const amount = Number(values.amount); if (amount <= 0) { setError("Payment amount must be greater than zero."); return; } setSaving(true); try { const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, amount }) }); if (!response.ok) throw new Error(`Payment recording failed (${response.status}).`); setDialog(null); setNotice("Payment recorded and linked to the invoice."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to record payment."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete payment ${String(row.payment_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/payments/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Payment deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete payment."); } }
  const received = Number(summary.amount);
 return (
  <>
    <PageHeader
      eyebrow="CASH FLOW"
      title="Payments"
      description="Record and reconcile customer payments across supported methods."
      action={
        <div className="flex gap-2">
          <button
            onClick={() => setReload((key) => key + 1)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            onClick={() => setDialog("new")}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Record payment
          </button>
        </div>
      }
    />

    {/* Notice */}
    {notice && (
      <button
        onClick={() => setNotice("")}
        className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
      >
        {notice} · dismiss
      </button>
    )}

    {/* Error */}
    {error && (
      <ErrorState
        message={error}
        onRetry={() => setReload((key) => key + 1)}
      />
    )}

    {/* Payment Summary */}
    <section className="mb-4 grid gap-3 sm:grid-cols-3">
      {[
        {
          label: "Payments recorded",
          value: summary.total,
        },
        {
          label: "Total received",
          value: formatCurrency(received),
        },
        {
          label: "Payment methods",
          value: new Set(
            rows.map((r) => String(r.payment_method ?? ""))
          ).size,
        },
      ].map((item) => (
        <article
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <p className="text-xs text-slate-500">
            {item.label}
          </p>

          <b className="mt-2 block text-xl">
            {loading ? "—" : item.value}
          </b>
        </article>
      ))}
    </section>

    {/* Payments Table */}
    <EntityTable
      rows={rows}
      columns={columns}
      loading={loading}
      emptyLabel="No payments found. Record a payment against an invoice."
      onEdit={() =>
        setError(
          "Payments are immutable. Record a correction or refund through the payment API."
        )
      }
      onDelete={remove}
      pagination={pagination}
      onPageChange={setPage}
    />

    {/* Record Payment Dialog */}
    {dialog && (
      <RecordDialog
        title="Record payment"
        fields={fields}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        saving={saving}
      />
    )}
  </>
);
}

