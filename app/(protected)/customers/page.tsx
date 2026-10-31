'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { parseApiList } from "@/lib/format";

const fields: FormFieldDefinition[] = [
  { key: "name", label: "Customer name", required: true }, { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "tel" }, { key: "company", label: "Company" },
  { key: "address", label: "Address", type: "textarea" }, { key: "status", label: "Status", options: ["Active", "Inactive", "Prospect"] },
];
const columns = [{ key: "name", label: "Customer" }, { key: "company", label: "Company" }, { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "status", label: "Status", format: "status" as const }];

export default function CustomersPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false); const [selected, setSelected] = useState<BillingRecord | null>(null);
  const [history, setHistory] = useState<{ subscriptions: BillingRecord[]; invoices: BillingRecord[] }>({ subscriptions: [], invoices: [] }); const [historyLoading, setHistoryLoading] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/customers", { cache: "no-store" }); if (!response.ok) throw new Error(`Customers API returned ${response.status}.`); setRows(await parseApiList<BillingRecord>(response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load customers."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { setSaving(true); try { const editing = dialog !== "new" && dialog !== null; const url = editing ? `/api/customers/${encodeURIComponent(dialog.id)}` : "/api/customers"; const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); if (!response.ok) throw new Error(`Save failed (${response.status}).`); setDialog(null); setNotice(editing ? "Customer updated." : "Customer added."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save customer."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete ${String(row.name ?? "this customer")}?`)) return; try { const response = await fetch(`/api/customers/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Customer deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete customer."); } }
  async function changeStatus(row: BillingRecord, status: string) { try { const response = await fetch(`/api/customers/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(`Status update failed (${response.status}).`); setReload((key) => key + 1); setNotice("Customer status updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update status."); } }
  async function openDetails(row: BillingRecord) { setSelected(row); setHistoryLoading(true); try { const response = await fetch(`/api/customers/${encodeURIComponent(row.id)}`, { cache: "no-store" }); if (!response.ok) throw new Error(`Customer detail API returned ${response.status}.`); const payload = await response.json() as { data?: { subscriptions?: BillingRecord[]; invoices?: BillingRecord[] }; subscriptions?: BillingRecord[]; invoices?: BillingRecord[] }; setHistory({ subscriptions: payload.data?.subscriptions ?? payload.subscriptions ?? [], invoices: payload.data?.invoices ?? payload.invoices ?? [] }); } catch { setHistory({ subscriptions: [], invoices: [] }); } finally { setHistoryLoading(false); } }

  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER RELATIONSHIPS"
        title="Customers"
        description="Manage customer contacts, account details, and billing history."
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
              Add customer
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

      {/* Customer Table */}
      <EntityTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyLabel="No customers found. Add the first customer to get started."
        onEdit={setDialog}
        onDelete={remove}
        onStatusChange={changeStatus}
        onRowClick={openDetails}
        statusOptions={["Active", "Inactive", "Prospect"]}
      />

      <p className="mt-3 text-xs text-slate-500">
        Select a customer name in the table to inspect account information and
        billing history.
      </p>

      {/* Add / Edit Customer Dialog */}
      {dialog && (
        <RecordDialog
          title={dialog === "new" ? "Add customer" : "Edit customer"}
          fields={fields}
          initialValues={dialog === "new" ? {} : dialog}
          onClose={() => setDialog(null)}
          onSubmit={submit}
          saving={saving}
        />
      )}

      {/* Customer Details Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/30 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <section className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            {/* Modal Header */}
            <div className="flex justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  Customer account
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  {String(selected.name ?? "Customer")}
                </h2>
              </div>

              <button
                onClick={() => setSelected(null)}
                className="text-sm text-slate-500"
              >
                Close
              </button>
            </div>

            {/* Customer Information */}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              {["email", "phone", "company", "status", "address"].map((key) => (
                <div key={key}>
                  <dt className="text-xs capitalize text-slate-500">
                    {key}
                  </dt>

                  <dd className="mt-1 text-slate-900">
                    {String(selected[key] ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Customer Billing History */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {/* Subscriptions */}
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold">Subscriptions</h3>

                {historyLoading ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Loading history…
                  </p>
                ) : history.subscriptions.length ? (
                  history.subscriptions.map((item) => (
                    <p
                      key={item.id}
                      className="mt-3 flex justify-between gap-2 text-xs"
                    >
                      <span>
                        {String(
                          item.subscription_number ??
                          item.plan_name ??
                          item.id
                        )}
                      </span>

                      <span className="text-slate-500">
                        {String(item.status ?? "—")}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    No subscription history returned.
                  </p>
                )}
              </section>

              {/* Invoices */}
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold">Invoices</h3>

                {historyLoading ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Loading history…
                  </p>
                ) : history.invoices.length ? (
                  history.invoices.map((item) => (
                    <p
                      key={item.id}
                      className="mt-3 flex justify-between gap-2 text-xs"
                    >
                      <span>
                        {String(item.invoice_number ?? item.id)}
                      </span>

                      <span className="text-slate-500">
                        {String(item.status ?? "—")}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    No invoice history returned.
                  </p>
                )}
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

