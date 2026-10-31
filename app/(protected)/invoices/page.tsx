'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, Printer, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { formatCurrency, formatDate, parseApiList } from "@/lib/format";

const fields: FormFieldDefinition[] = [{ key: "invoice_number", label: "Invoice number" }, { key: "customer_id", label: "Customer ID", required: true }, { key: "subscription_id", label: "Subscription ID" }, { key: "invoice_date", label: "Invoice date", type: "date", required: true }, { key: "due_date", label: "Due date", type: "date", required: true }, { key: "subtotal", label: "Subtotal (₹)", type: "number", required: true }, { key: "tax_rate", label: "Tax rate (%)", type: "number" }, { key: "discount_amount", label: "Discount (₹)", type: "number" }, { key: "notes", label: "Line items / notes", type: "textarea" }];
const columns = [{ key: "invoice_number", label: "Invoice" }, { key: "customer_name", label: "Customer" }, { key: "invoice_date", label: "Invoice date", format: "date" as const }, { key: "due_date", label: "Due date", format: "date" as const }, { key: "total_amount", label: "Total", format: "currency" as const }, { key: "outstanding_amount", label: "Outstanding", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];

export default function InvoicesPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false); const [preview, setPreview] = useState<BillingRecord | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/invoices", { cache: "no-store" }); if (!response.ok) throw new Error(`Invoices API returned ${response.status}.`); setRows(await parseApiList<BillingRecord>(response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load invoices."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const subtotal = Number(values.subtotal); const rate = Number(values.tax_rate || 0); const discount = Number(values.discount_amount || 0); if (subtotal < 0 || rate < 0 || discount < 0 || discount > subtotal) { setError("Enter non-negative amounts; discount cannot exceed subtotal."); return; } const tax = subtotal * rate / 100; const total = subtotal + tax - discount; setSaving(true); try { const editing = dialog !== "new" && dialog !== null; const response = await fetch(editing ? `/api/invoices/${encodeURIComponent(dialog.id)}` : "/api/invoices", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, subtotal, tax_rate: rate, tax_amount: tax, discount_amount: discount, total_amount: total, paid_amount: 0, outstanding_amount: total, status: "Draft" }) }); if (!response.ok) throw new Error(`Save failed (${response.status}).`); setDialog(null); setNotice(`Invoice saved · total ${formatCurrency(total)}.`); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save invoice."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete invoice ${String(row.invoice_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/invoices/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Invoice deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete invoice."); } }
  async function updateStatus(row: BillingRecord, status: string) { try { const response = await fetch(`/api/invoices/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(`Status update failed (${response.status}).`); setNotice(`Invoice marked ${status.toLowerCase()}.`); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update invoice."); } }
  return (
    <>
      <PageHeader
        eyebrow="BILLING"
        title="Invoices"
        description="Create recurring invoices, review balances, and manage invoice status."
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
              Create invoice
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

      {/* Invoices Table */}
      <EntityTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyLabel="No invoices found. Create an invoice or generate it from a renewal."
        onEdit={setDialog}
        onDelete={remove}
        onStatusChange={updateStatus}
        onRowClick={setPreview}
        statusOptions={["Draft", "Confirmed", "Paid"]}
      />

      <p className="mt-3 text-xs text-slate-500">
        Select an invoice row to open its printable detail preview.
      </p>

      {/* Create / Edit Invoice Dialog */}
      {dialog && (
        <RecordDialog
          title={dialog === "new" ? "Create invoice" : "Edit invoice"}
          fields={fields}
          initialValues={dialog === "new" ? {} : dialog}
          onClose={() => setDialog(null)}
          onSubmit={submit}
          saving={saving}
        />
      )}

      {/* Invoice Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/35 p-4 print:static print:bg-white print:p-0">
          <article className="w-full max-w-2xl rounded-xl bg-white p-7 shadow-xl print:max-w-none print:shadow-none">

            {/* Invoice Header */}
            <div className="flex justify-between">
              <div>
                <p className="text-xs font-semibold tracking-widest text-indigo-600">
                  BRIGHTLOOP SOFTWARE
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Invoice {String(preview.invoice_number ?? preview.id)}
                </h2>
              </div>

              <button
                onClick={() => setPreview(null)}
                className="text-sm text-slate-500 print:hidden"
              >
                Close
              </button>
            </div>

            {/* Invoice Information */}
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <p>
                <span className="block text-xs text-slate-500">
                  Bill to
                </span>
                {String(
                  preview.customer_name ??
                  preview.customer_id ??
                  "Customer"
                )}
              </p>

              <p>
                <span className="block text-xs text-slate-500">
                  Status
                </span>
                {String(preview.status ?? "Draft")}
              </p>

              <p>
                <span className="block text-xs text-slate-500">
                  Invoice date
                </span>
                {formatDate(preview.invoice_date)}
              </p>

              <p>
                <span className="block text-xs text-slate-500">
                  Due date
                </span>
                {formatDate(preview.due_date)}
              </p>
            </div>

            {/* Invoice Amount Breakdown */}
            <div className="mt-7 border-t border-slate-200 pt-4 text-sm">
              <div className="flex justify-between py-2">
                <span>Subtotal</span>
                <span>{formatCurrency(preview.subtotal)}</span>
              </div>

              <div className="flex justify-between py-2">
                <span>Tax</span>
                <span>{formatCurrency(preview.tax_amount)}</span>
              </div>

              <div className="flex justify-between py-2">
                <span>Discount</span>
                <span>
                  −{formatCurrency(preview.discount_amount)}
                </span>
              </div>

              <div className="mt-2 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold">
                <span>Total due</span>
                <span>{formatCurrency(preview.total_amount)}</span>
              </div>
            </div>

            {/* Print Invoice */}
            <div className="mt-6 flex justify-end gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              >
                <Printer className="h-4 w-4" />
                Print invoice
              </button>
            </div>

          </article>
        </div>
      )}
    </>
  );
}

