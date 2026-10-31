'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { formatCurrency, parseApiList } from "@/lib/format";

const fields: FormFieldDefinition[] = [{ key: "customer_id", label: "Customer ID", required: true }, { key: "plan_id", label: "Plan ID", required: true }, { key: "product_id", label: "Product ID", required: true }, { key: "quantity", label: "Quantity", type: "number", required: true }, { key: "unit_price", label: "Unit price (₹)", type: "number", required: true }, { key: "tax_rate", label: "Tax rate (%)", type: "number" }, { key: "valid_until", label: "Valid until", type: "date", required: true }, { key: "notes", label: "Notes", type: "textarea" }];
const columns = [{ key: "quotation_number", label: "Quotation" }, { key: "customer_name", label: "Customer" }, { key: "valid_until", label: "Valid until", format: "date" as const }, { key: "total_amount", label: "Total", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];

export default function QuotationsPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/quotations", { cache: "no-store" }); if (!response.ok) throw new Error(`Quotations API returned ${response.status}.`); setRows(await parseApiList<BillingRecord>(response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load quotations."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const quantity = Number(values.quantity); const unit = Number(values.unit_price); const tax = Number(values.tax_rate || 0); if (quantity <= 0 || unit < 0 || tax < 0) { setError("Quantity must be positive and prices and tax cannot be negative."); return; } setSaving(true); try { const editing = dialog !== "new" && dialog !== null; const body = { ...values, quantity, unit_price: unit, tax_rate: tax, subtotal: quantity * unit, tax_amount: quantity * unit * tax / 100, total_amount: quantity * unit * (1 + tax / 100) }; const response = await fetch(editing ? `/api/quotations/${encodeURIComponent(dialog.id)}` : "/api/quotations", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Save failed (${response.status}).`); setDialog(null); setNotice("Quotation saved."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save quotation."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete quotation ${String(row.quotation_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Quotation deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete quotation."); } }
  async function convert(row: BillingRecord, status: string) { try { if (status === "Converted") { if (!window.confirm(`Convert ${String(row.quotation_number ?? "this quotation")} into a subscription?`)) { setReload((key) => key + 1); return; } const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}/convert`, { method: "POST" }); if (!response.ok) throw new Error(`Conversion failed (${response.status}).`); setNotice("Quotation converted into a subscription."); } else { const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(`Status update failed (${response.status}).`); setNotice(`Quotation marked ${status.toLowerCase()}.`); } setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update quotation."); setReload((key) => key + 1); } }
  return <>
 <PageHeader
  eyebrow="SALES"
  title="Quotations"
  description="Prepare commercial offers and convert accepted quotations into subscriptions."
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
        New quotation
      </button>
    </div>
  }
/>

{notice && (
  <button
    onClick={() => setNotice("")}
    className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
  >
    {notice} · dismiss
  </button>
)}

{error && (
  <ErrorState
    message={error}
    onRetry={() => setReload((key) => key + 1)}
  />
)}

<section className="mb-4 grid gap-3 sm:grid-cols-3">
  {[
    {
      label: "Open quotations",
      value: rows.filter((row) =>
        ["draft", "sent"].includes(String(row.status).toLowerCase())
      ).length,
    },
    {
      label: "Quoted value",
      value: formatCurrency(
        rows.reduce(
          (sum, row) => sum + Number(row.total_amount ?? 0),
          0
        )
      ),
    },
    {
      label: "Accepted",
      value: rows.filter((row) =>
        ["accepted", "converted"].includes(String(row.status).toLowerCase())
      ).length,
    },
  ].map((item) => (
    <div
      key={item.label}
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <p className="text-xs text-slate-500">{item.label}</p>

      <b className="mt-2 block text-xl">
        {loading ? "—" : item.value}
      </b>
    </div>
  ))}
</section>

<EntityTable
  rows={rows}
  columns={columns}
  loading={loading}
  emptyLabel="No quotations found. Create a quotation for a customer."
  onEdit={setDialog}
  onDelete={remove}
  onStatusChange={convert}
  statusOptions={["Draft", "Sent", "Accepted", "Rejected", "Converted"]}
/>

<p className="mt-3 text-xs text-slate-500">
  Quotation templates and PDF delivery can be connected through the quotation API.
</p>

{dialog && (
  <RecordDialog
    title={dialog === "new" ? "Create quotation" : "Edit quotation"}
    fields={fields}
    initialValues={dialog === "new" ? {} : dialog}
    onClose={() => setDialog(null)}
    onSubmit={submit}
    saving={saving}
  />
)}
</>
}

