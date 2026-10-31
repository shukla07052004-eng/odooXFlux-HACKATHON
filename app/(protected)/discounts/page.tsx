'use client';

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { parseApiList } from "@/lib/format";

const fields: FormFieldDefinition[] = [{ key: "name", label: "Discount name", required: true }, { key: "discount_type", label: "Discount type", options: ["Fixed", "Percentage"] }, { key: "discount_value", label: "Discount value", type: "number", required: true }, { key: "minimum_purchase_amount", label: "Minimum purchase (₹)", type: "number" }, { key: "minimum_quantity", label: "Minimum quantity", type: "number" }, { key: "applicable_products", label: "Applicable product IDs", type: "textarea" }, { key: "start_date", label: "Start date", type: "date" }, { key: "end_date", label: "End date", type: "date" }, { key: "maximum_usage_count", label: "Maximum usage count", type: "number" }];
const columns = [{ key: "name", label: "Discount" }, { key: "discount_type", label: "Type" }, { key: "discount_value", label: "Value" }, { key: "start_date", label: "Starts", format: "date" as const }, { key: "end_date", label: "Ends", format: "date" as const }, { key: "usage_count", label: "Used" }, { key: "status", label: "Status", format: "status" as const }];
const currentDate = new Date().toISOString().slice(0, 10);

export default function DiscountsPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [reload, setReload] = useState(0); const [dialog, setDialog] = useState<null | BillingRecord | "new">(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/discounts", { cache: "no-store" }); if (!response.ok) throw new Error(`Discounts API returned ${response.status}.`); setRows(await parseApiList<BillingRecord>(response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load discounts."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);
  async function submit(values: Record<string, string>) { const amount = Number(values.discount_value); const minimum = Number(values.minimum_purchase_amount || 0); const quantity = Number(values.minimum_quantity || 0); const cap = values.maximum_usage_count ? Number(values.maximum_usage_count) : null; if (amount <= 0 || minimum < 0 || quantity < 0 || (values.discount_type === "Percentage" && amount > 100)) { setError("Enter a positive discount; percentage values must be 100 or less."); return; } setSaving(true); try { const editing = dialog !== "new" && dialog !== null; const response = await fetch(editing ? `/api/discounts/${encodeURIComponent(dialog.id)}` : "/api/discounts", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, discount_value: amount, minimum_purchase_amount: minimum, minimum_quantity: quantity, maximum_usage_count: cap, applicable_products: values.applicable_products.split(",").map((id) => id.trim()).filter(Boolean) }) }); if (!response.ok) throw new Error(`Save failed (${response.status}).`); setDialog(null); setNotice("Discount saved."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save discount."); } finally { setSaving(false); } }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete discount ${String(row.name ?? row.id)}?`)) return; try { const response = await fetch(`/api/discounts/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Discount deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete discount."); } }
  const classify = (row: BillingRecord) => { if (Number(row.maximum_usage_count) > 0 && Number(row.usage_count ?? 0) >= Number(row.maximum_usage_count)) return "Exhausted"; const end = row.end_date ? String(row.end_date).slice(0, 10) : null; return end && end < currentDate ? "Expired" : "Active"; };
  return (
    <>
      <PageHeader
        eyebrow="PROMOTIONS"
        title="Discounts"
        description="Configure product discounts, eligibility thresholds, and usage limits."
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
              Create discount
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

      {/* Discount Summary */}
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        {["Active", "Expired", "Exhausted"].map((status) => (
          <article
            key={status}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs text-slate-500">
              {status} discounts
            </p>

            <b className="mt-2 block text-xl">
              {loading
                ? "—"
                : rows.filter((row) => classify(row) === status).length}
            </b>
          </article>
        ))}
      </section>

      {/* Discounts Table */}
      <EntityTable
        rows={rows.map((row) => ({
          ...row,
          status: classify(row),
          discount_value: `${String(row.discount_value ?? 0)}${String(row.discount_type).toLowerCase() === "percentage"
              ? "%"
              : " ₹"
            }`,
        }))}
        columns={columns}
        loading={loading}
        emptyLabel="No discounts found. Create a promotion to offer a price reduction."
        onEdit={(row) =>
          setDialog(rows.find((item) => item.id === row.id) ?? row)
        }
        onDelete={remove}
      />

      {/* Create / Edit Discount Dialog */}
      {dialog && (
        <RecordDialog
          title={dialog === "new" ? "Create discount" : "Edit discount"}
          fields={fields}
          initialValues={dialog === "new" ? {} : dialog}
          onClose={() => setDialog(null)}
          onSubmit={submit}
          saving={saving}
        />
      )}
    </>
  );
}

