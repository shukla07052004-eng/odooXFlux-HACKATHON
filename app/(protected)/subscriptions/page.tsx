'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord } from "@/types/billing";
import { formatCurrency, parseApiList } from "@/lib/format";

const columns = [{ key: "subscription_number", label: "Subscription" }, { key: "customer_name", label: "Customer" }, { key: "plan_name", label: "Plan" }, { key: "start_date", label: "Start date", format: "date" as const }, { key: "next_billing_date", label: "Next billing", format: "date" as const }, { key: "total_amount", label: "Amount", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [page, setPage] = useState(1); const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 }); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false);
  const [billingItems, setBillingItems] = useState<Array<{label:string;value:string}>>([]);
  const [customers, setCustomers] = useState<Array<{label:string;value:string}>>([]);
  const [plans, setPlans] = useState<BillingRecord[]>([]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [response, productsResponse, customersResponse, plansResponse] = await Promise.all([fetch(`/api/subscriptions?page=${page}&pageSize=50`, { cache: "no-store" }), fetch("/api/products", { cache: "no-store" }), fetch("/api/customers", { cache: "no-store" }), fetch("/api/plans", { cache: "no-store" })]); if ([response,productsResponse,customersResponse,plansResponse].some((item)=>!item.ok)) throw new Error("Unable to load subscription setup data."); const subscriptionPayload=await response.json() as {data?:BillingRecord[];pagination?:typeof pagination}; setRows(subscriptionPayload.data??[]); setPagination(subscriptionPayload.pagination??{page,pageSize:50,total:subscriptionPayload.data?.length??0,totalPages:1}); const products = await parseApiList<BillingRecord>(productsResponse); setBillingItems(products.flatMap((product) => [{ value: String(product.id), label: `${String(product.name)} · base price ${formatCurrency(product.sales_price)}` }, ...(Array.isArray(product.variants) ? product.variants as BillingRecord[] : []).map((variant) => ({ value: String(variant.id), label: `${String(product.name)} · ${String(variant.name)} (+${formatCurrency(variant.additional_price)})` }))])); const customerRows=await parseApiList<BillingRecord>(customersResponse); setCustomers(customerRows.map((row)=>({value:String(row.id),label:`${String(row.name)} · ${String(row.email)}`}))); setPlans(await parseApiList<BillingRecord>(plansResponse)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load subscriptions."); } finally { setLoading(false); } }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const editing = dialog !== "new" && dialog !== null; const quantity = Number(values.quantity); if (!editing && quantity <= 0) { setError("Quantity must be positive."); return; } setSaving(true); try { const response = await fetch(editing ? `/api/subscriptions/${encodeURIComponent(dialog.id)}` : "/api/subscriptions", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? values : { ...values, quantity }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? `Save failed (${response.status}).`); setDialog(null); setNotice(editing ? "Subscription updated." : "Subscription created from the selected plan price."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save subscription."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete subscription ${String(row.subscription_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/subscriptions/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Subscription deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete subscription."); } }
  async function updateStatus(row: BillingRecord, status: string) { try { const response = await fetch(`/api/subscriptions/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) throw new Error(`Status update failed (${response.status}).`); setNotice(`Subscription ${status.toLowerCase()}.`); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update subscription."); } }
  const value = rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  return <>
    <PageHeader
      eyebrow="RECURRING REVENUE"
      title="Subscriptions"
      description="Create, renew, pause, activate, and close customer subscriptions."
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
            New subscription
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
          label: "Active",
          value: rows.filter(
            (r) => String(r.status).toLowerCase() === "active"
          ).length,
        },
        {
          label: "Renewal portfolio",
          value: formatCurrency(value),
        },
        {
          label: "Needs attention",
          value: rows.filter((r) =>
            ["draft", "quotation"].includes(String(r.status).toLowerCase())
          ).length,
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

    <EntityTable
      rows={rows}
      columns={columns}
      loading={loading}
      emptyLabel="No subscriptions found. Create one or convert an accepted quotation."
      onEdit={setDialog}
      onDelete={remove}
      onStatusChange={updateStatus}
      statusOptions={[
        "Draft",
        "Quotation",
        "Confirmed",
        "Active",
        "Paused",
        "Closed",
      ]}
      pagination={pagination}
      onPageChange={setPage}
    />

    <p className="mt-3 text-xs text-slate-500">
      Use the Status column for lifecycle actions; renewal and timeline events
      are stored by the subscriptions API.
    </p>

    {dialog && (
      <RecordDialog
        title={dialog === "new" ? "Create subscription" : "Edit subscription"}
        fields={dialog === "new" ? [{ key: "subscription_number", label: "Subscription number" }, { key: "customer_id", label: "Customer", required: true, options: customers }, { key: "plan_id", label: "Plan", required: true, options: plans.map((plan) => ({ value: String(plan.id), label: `${String(plan.name)} · ${formatCurrency(plan.price)} / ${String(plan.billing_interval)}` })) }, { key: "start_date", label: "Start date", type: "date", required: true }, { key: "expiry_date", label: "Expiry date", type: "date" }, { key: "payment_terms", label: "Payment terms", options: ["Due on receipt", "Net 15", "Net 30", "Net 45"] }, { key: "quantity", label: "Plan quantity", type: "number", required: true }, { key: "billing_item_ids", label: "Associated plan products / variants", options: billingItems, multiple: true }] : [{ key: "status", label: "Lifecycle status", options: ["Draft", "Quotation", "Confirmed", "Active", "Paused", "Closed"] }, { key: "expiry_date", label: "Expiry date", type: "date" }, { key: "payment_terms", label: "Payment terms", options: ["Due on receipt", "Net 15", "Net 30", "Net 45"] }]}
        initialValues={dialog === "new" ? {} : dialog}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        saving={saving}
      />
    )}
  </>
}

