'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { EntityTable } from "@/components/ui/entity-table";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordDialog } from "@/components/ui/record-dialog";
import type { BillingRecord, FormFieldDefinition } from "@/types/billing";
import { formatCurrency, parseApiList } from "@/lib/format";

const columns = [{ key: "quotation_number", label: "Quotation" }, { key: "customer_name", label: "Customer" }, { key: "template_name", label: "Template" }, { key: "valid_until", label: "Valid until", format: "date" as const }, { key: "total_amount", label: "Total", format: "currency" as const }, { key: "status", label: "Status", format: "status" as const }];
type Option = { label: string; value: string };

export default function QuotationsPage() {
  const [rows, setRows] = useState<BillingRecord[]>([]);
  const [templates, setTemplates] = useState<BillingRecord[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [variants, setVariants] = useState<Option[]>([]);
  const [plans, setPlans] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<null | BillingRecord | "new" | "template">(null);
  const [saving, setSaving] = useState(false);

  const fields = useMemo<FormFieldDefinition[]>(() => [
    { key: "customer_id", label: "Customer", required: true, options: customers },
    { key: "template_id", label: "Quotation template (optional)", options: [{ label: "No template · add a product below", value: "" }, ...templates.map((template) => ({ label: String(template.name), value: String(template.id) }))] },
    { key: "plan_id", label: "Plan (optional)", options: [{ label: "No plan", value: "" }, ...plans] },
    { key: "product_id", label: "Product (required without template)", options: [{ label: "Choose product", value: "" }, ...products] },
    { key: "variant_id", label: "Product variant (optional)", options: variants },
    { key: "quantity", label: "Quantity", type: "number", required: true },
    { key: "valid_until", label: "Valid until (required without template)", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ], [customers, plans, products, templates, variants]);
  const templateFields = useMemo<FormFieldDefinition[]>(() => [
    { key: "name", label: "Template name", required: true },
    { key: "plan_id", label: "Plan (optional)", options: [{ label: "No plan", value: "" }, ...plans] },
    { key: "validity_days", label: "Validity (days)", type: "number", required: true },
    { key: "product_id", label: "Product", options: products, required: true },
    { key: "variant_id", label: "Product variant (optional)", options: variants },
    { key: "quantity", label: "Quantity", type: "number", required: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ], [plans, products, variants]);
  const editFields: FormFieldDefinition[] = [
    { key: "status", label: "Status", options: ["Draft", "Sent", "Accepted", "Rejected"] },
    { key: "valid_until", label: "Valid until", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const paths = ["/api/quotations", "/api/quotation-templates", "/api/customers", "/api/products", "/api/plans"];
      const responses = await Promise.all(paths.map((path) => fetch(path, { cache: "no-store" })));
      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(`Quotation data API returned ${failed.status}.`);
      const [quotationRows, templateRows, customerRows, productRows, planRows] = await Promise.all(responses.map((response) => parseApiList<BillingRecord>(response)));
      setRows(quotationRows); setTemplates(templateRows);
      setCustomers(customerRows.map((row) => ({ value: String(row.id), label: String(row.name ?? row.email ?? row.id) })));
      setProducts(productRows.map((row) => ({ value: String(row.id), label: String(row.name ?? row.id) })));
      setVariants([{ value: "", label: "Base product price" }, ...productRows.flatMap((row) => (Array.isArray(row.variants) ? row.variants as BillingRecord[] : []).map((variant) => ({ value: String(variant.id), label: `${String(row.name)} · ${String(variant.name)} (+${formatCurrency(variant.additional_price)})` })))]);
      setPlans(planRows.map((row) => ({ value: String(row.id), label: String(row.name ?? row.id) })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load quotations."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, reload]);

  async function save(values: Record<string, string>, templateMode = false) {
    const quantity = Number(values.quantity);
    if (!templateMode && !values.template_id && (!values.product_id || quantity <= 0 || !values.valid_until)) { setError("Choose a product, positive quantity, and validity date, or select a template."); return; }
    if (templateMode && quantity <= 0) { setError("Template quantity must be positive."); return; }
    setSaving(true); setError("");
    try {
      const path = templateMode ? "/api/quotation-templates" : "/api/quotations";
      const body = templateMode ? { ...values, quantity, validity_days: Number(values.validity_days) } : { ...values, quantity };
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? `Save failed (${response.status}).`);
      setDialog(null); setNotice(templateMode ? "Quotation template created." : "Quotation created with server-calculated pricing and tax."); setReload((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save quotation."); }
    finally { setSaving(false); }
  }
  async function updateQuotation(row: BillingRecord, values: Record<string, string>) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? `Update failed (${response.status}).`);
      setDialog(null); setNotice("Quotation updated."); setReload((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update quotation."); }
    finally { setSaving(false); }
  }
  async function remove(row: BillingRecord) { if (!window.confirm(`Delete quotation ${String(row.quotation_number ?? row.id)}?`)) return; try { const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}`, { method: "DELETE" }); if (!response.ok) throw new Error(`Delete failed (${response.status}).`); setNotice("Quotation deleted."); setReload((key) => key + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete quotation."); } }
  async function updateStatus(row: BillingRecord, status: string) {
    try {
      if (status === "Converted") {
        if (!window.confirm(`Convert ${String(row.quotation_number ?? "this quotation")} into a subscription?`)) { setReload((key) => key + 1); return; }
        const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}/convert`, { method: "POST" });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message ?? `Conversion failed (${response.status}).`);
        setNotice("Quotation converted into a subscription.");
      } else {
        const response = await fetch(`/api/quotations/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message ?? `Status update failed (${response.status}).`);
        setNotice(`Quotation marked ${status.toLowerCase()}.`);
      }
      setReload((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update quotation."); setReload((key) => key + 1); }
  }

  return <>
    <PageHeader eyebrow="SALES" title="Quotations" description="Prepare offers from product pricing, reuse templates, and convert accepted quotations into subscriptions." action={<div className="flex gap-2"><button onClick={() => setReload((key) => key + 1)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm"><RefreshCw className="h-4 w-4"/>Refresh</button><button onClick={() => setDialog("template")} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm">New template</button><button onClick={() => setDialog("new")} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>New quotation</button></div>} />
    {notice && <button onClick={() => setNotice("")} className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{notice} · dismiss</button>}
    {error && <ErrorState message={error} onRetry={() => setReload((key) => key + 1)} />}
    <section className="mb-4 grid gap-3 sm:grid-cols-3">{[{ label: "Open quotations", value: rows.filter((row) => ["draft", "sent"].includes(String(row.status).toLowerCase())).length }, { label: "Quoted value", value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0)) }, { label: "Saved templates", value: templates.length }].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{item.label}</p><b className="mt-2 block text-xl">{loading ? "—" : item.value}</b></div>)}</section>
    {templates.length > 0 && <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold">Quotation templates</h2><ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{templates.map((template) => <li key={String(template.id)} className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-sm font-medium">{String(template.name)}</span><span className="text-xs text-slate-500">{String(template.plan_name ?? "No plan")} · {String(template.validity_days)} days · {Array.isArray(template.items) ? template.items.length : 0} item(s)</span></li>)}</ul></section>}
    <EntityTable rows={rows} columns={columns} loading={loading} emptyLabel="No quotations found. Create a quotation for a customer." onEdit={setDialog} onDelete={remove} onStatusChange={updateStatus} statusOptions={["Draft", "Sent", "Accepted", "Rejected", "Converted"]}/>
    {dialog && <RecordDialog title={dialog === "template" ? "Create quotation template" : dialog === "new" ? "Create quotation" : "Edit quotation"} fields={dialog === "template" ? templateFields : dialog === "new" ? fields : editFields} initialValues={dialog === "new" ? { validity_days: 30, quantity: 1 } : dialog === "template" ? { validity_days: 30, quantity: 1 } : dialog} onClose={() => setDialog(null)} onSubmit={(values) => dialog !== "template" && dialog !== "new" ? updateQuotation(dialog, values) : save(values, dialog === "template")} saving={saving} />}
  </>;
}
