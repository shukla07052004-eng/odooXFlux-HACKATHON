'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, Printer, RefreshCw, Zap } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { formatCurrency, formatDate, parseApiList } from "@/lib/format";

const fields: FormFieldDefinition[] = [{ key: "customer_id", label: "Customer", required: true, options: [] }, { key: "subscription_id", label: "Subscription (optional)", options: [] }, { key: "invoice_date", label: "Invoice date", type: "date", required: true }, { key: "due_date", label: "Due date", type: "date", required: true }, { key: "subtotal", label: "Subtotal (₹)", type: "number", required: true }, { key: "discount_id", label: "Configured discount (optional)", options: [{ label: "No configured discount", value: "" }] }, { key: "discount_amount", label: "Manual discount (₹)", type: "number" }, { key: "notes", label: "Line items / notes", type: "textarea" }];
const columns = [{ key: "invoice_number", label: "Invoice" }, { key: "customer_name", label: "Customer" }, { key: "invoice_date", label: "Invoice date", format: "date" as const }, { key: "due_date", label: "Due date", format: "date" as const }, { key: "total_amount", label: "Total", format: "currency" as const }, { key: "outstanding_amount", label: "Outstanding", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];
const editFields: FormFieldDefinition[] = [{ key: "status", label: "Invoice status", options: ["Draft", "Confirmed", "Cancelled"] }];

export default function InvoicesPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [discounts, setDiscounts] = useState<BillingRecord[]>([]); const [customers, setCustomers] = useState<BillingRecord[]>([]); const [subscriptions, setSubscriptions] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [page, setPage] = useState(1); const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 }); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false); const [preview, setPreview] = useState<BillingRecord | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const responses = await Promise.all([fetch(`/api/invoices?page=${page}&pageSize=50`, { cache: "no-store" }), fetch("/api/discounts", { cache: "no-store" }), fetch("/api/customers", { cache: "no-store" }), fetch("/api/subscriptions?page=1&pageSize=100", { cache: "no-store" })]); if (responses.some((response) => !response.ok)) throw new Error("Unable to load invoice, customer, subscription, and discount data."); const payload = await responses[0].json() as { data?: BillingRecord[]; pagination?: typeof pagination }; setRows(payload.data ?? []); setPagination(payload.pagination ?? { page, pageSize: 50, total: payload.data?.length ?? 0, totalPages: 1 }); setDiscounts(await parseApiList<BillingRecord>(responses[1])); setCustomers(await parseApiList<BillingRecord>(responses[2])); setSubscriptions(await parseApiList<BillingRecord>(responses[3])); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load invoices."); } finally { setLoading(false); } }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const editing = dialog !== "new" && dialog !== null; const subtotal = Number(values.subtotal); const discount = Number(values.discount_amount || 0); if (!editing && (!values.customer_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.customer_id))) { setError("Choose a customer from the list."); return; } if (!editing && values.subscription_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.subscription_id)) { setError("Choose a subscription from the list, or leave it blank."); return; } const chosenSubscription = subscriptions.find((subscription) => subscription.id === values.subscription_id); if (!editing && chosenSubscription && chosenSubscription.customer_id !== values.customer_id) { setError("That subscription belongs to a different customer. Choose a matching customer and subscription."); return; } if (!editing && (subtotal < 0 || discount < 0 || discount > subtotal)) { setError("Enter non-negative amounts; discount cannot exceed subtotal."); return; } setSaving(true); try { const response = await fetch(editing ? `/api/invoices/${encodeURIComponent(dialog.id)}` : "/api/invoices", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? values : { ...values, subtotal, discount_amount: discount }) }); const result = await response.json() as { total_amount?: number; message?: string }; if (!response.ok) throw new Error(result.message ?? `Save failed (${response.status}).`); setDialog(null); setNotice(editing ? "Invoice status updated." : `Invoice saved · total ${formatCurrency(result.total_amount ?? subtotal - discount)}.`); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save invoice."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete invoice ${String(row.invoice_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/invoices/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Invoice deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete invoice."); } }
  async function updateStatus(row: BillingRecord, status: string) { if (!["Draft", "Confirmed", "Cancelled"].includes(status)) return; try { const response = await fetch(`/api/invoices/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? `Status update failed (${response.status}).`); setNotice(`Invoice marked ${status.toLowerCase()}.`); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update invoice."); } }
  async function generateDueInvoices() { setSaving(true); setError(""); try { const response = await fetch("/api/invoices/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? `Invoice generation failed (${response.status}).`); setNotice(result.message ?? "Due subscription invoices generated."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to generate invoices."); } finally { setSaving(false); } }
  async function sendInvoice(row: BillingRecord) { setError(""); try { const response = await fetch(`/api/invoices/${encodeURIComponent(row.id)}/send`, { method: "POST" }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? `Invoice email failed (${response.status}).`); setNotice(result.message ?? "Invoice email sent."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to send invoice."); } }
  return (
    <>
      <PageHeader
        eyebrow="BILLING"
        title="Invoices"
        description="Create recurring invoices, review balances, and manage invoice status."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => void generateDueInvoices()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 disabled:opacity-60"
            >
              <Zap className="h-4 w-4" />
              {saving ? "Generating…" : "Generate due"}
            </button>

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
        onSend={sendInvoice}
        statusOptions={["Draft", "Confirmed", "Cancelled"]}
        pagination={pagination}
        onPageChange={setPage}
      />

      <p className="mt-3 text-xs text-slate-500">
        Select an invoice row to open its printable detail preview.
      </p>

      {/* Create / Edit Invoice Dialog */}
      {dialog && (
        <RecordDialog
          title={dialog === "new" ? "Create invoice" : "Edit invoice"}
          fields={dialog === "new" ? fields.map((field) => field.key === "customer_id" ? { ...field, options: [{ label: "Choose a customer", value: "" }, ...customers.map((customer) => ({ value: String(customer.id), label: `${String(customer.name)} · ${String(customer.email)}` }))] } : field.key === "subscription_id" ? { ...field, options: [{ label: "No subscription", value: "" }, ...subscriptions.map((subscription) => ({ value: String(subscription.id), label: `${String(subscription.subscription_number)} · ${String(subscription.customer_name)}` }))] } : field.key === "discount_id" ? { ...field, options: [{ label: "No configured discount", value: "" }, ...discounts.filter((discount) => String(discount.status).toLowerCase() === "active" && (!discount.start_date || String(discount.start_date).slice(0,10) <= new Date().toISOString().slice(0,10)) && (!discount.end_date || String(discount.end_date).slice(0,10) >= new Date().toISOString().slice(0,10)) && (!discount.maximum_usage_count || Number(discount.usage_count ?? 0) < Number(discount.maximum_usage_count))).map((discount) => ({ value: String(discount.id), label: `${String(discount.name)} · ${discount.discount_type === "Percentage" ? `${String(discount.discount_value)}%` : formatCurrency(discount.discount_value)}` }))] } : field) : editFields}
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

            <div className="mt-7 overflow-x-auto border-t border-slate-200 pt-4">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Tax</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{(Array.isArray(preview.items) ? preview.items as BillingRecord[] : []).map((item) => <tr key={String(item.id)}><td className="py-2">{String(item.description ?? "Item")}</td><td className="py-2 text-right">{String(item.quantity ?? 0)}</td><td className="py-2 text-right">{formatCurrency(item.unit_price)}</td><td className="py-2 text-right">{String(item.tax_rate ?? 0)}%</td></tr>)}</tbody>
              </table>
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

              <div className="flex justify-between py-2">
                <span>Paid</span>
                <span>{formatCurrency(preview.paid_amount)}</span>
              </div>

              <div className="flex justify-between py-2">
                <span>Outstanding</span>
                <span>{formatCurrency(preview.outstanding_amount)}</span>
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

