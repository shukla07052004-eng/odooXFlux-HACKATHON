'use client';

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { BillingRecord, ColumnDefinition } from "@/types/billing";
import { formatCurrency, formatDate } from "@/lib/format";
import { StatusBadge } from "./status-badge";

export function EntityTable({ rows, columns, loading, emptyLabel, onEdit, onDelete, onStatusChange, onRowClick, statusOptions = [] }: {
  rows: BillingRecord[];
  columns: ColumnDefinition[];
  loading: boolean;
  emptyLabel: string;
  onEdit: (row: BillingRecord) => void;
  onDelete: (row: BillingRecord) => void;
  onStatusChange?: (row: BillingRecord, status: string) => void;
  onRowClick?: (row: BillingRecord) => void;
  statusOptions?: string[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: columns[0]?.key ?? "id", direction: "asc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const filteredRows = useMemo(() => rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase())).sort((left, right) => {
    const a = left[sort.key]; const b = right[sort.key];
    const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""));
    return sort.direction === "asc" ? comparison : -comparison;
  }), [rows, query, sort]);
  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visible = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900">Records</h2><p className="mt-0.5 text-xs text-slate-500">{filteredRows.length} total</p></div><label className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 px-3 text-slate-400 sm:w-64"><Search className="h-4 w-4"/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search records…" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"/></label></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead className="bg-slate-50"><tr>{columns.map((column) => <th key={column.key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><button className="inline-flex items-center gap-1.5" onClick={() => setSort((current) => ({ key: column.key, direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc" }))}>{column.label}{sort.key === column.key && (sort.direction === "asc" ? <ArrowUp className="h-3 w-3"/> : <ArrowDown className="h-3 w-3"/>)}</button></th>)}<th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-slate-500"><span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 align-middle"/> <span className="ml-2">Loading records…</span></td></tr> : visible.length ? visible.map((row) => <tr key={row.id} onClick={() => onRowClick?.(row)} className={`${onRowClick ? "cursor-pointer " : ""}hover:bg-slate-50/80`}>{columns.map((column) => <td key={column.key} className="px-4 py-3 text-sm text-slate-700">{column.format === "status" ? onStatusChange ? <select value={String(row[column.key] ?? "Draft")} onChange={(event) => onStatusChange(row, event.target.value)} className="rounded-full border-0 bg-transparent p-0 text-xs font-semibold text-slate-600 outline-none">{Array.from(new Set([String(row[column.key] ?? "Draft"), ...statusOptions])).map((status) => <option key={status}>{status}</option>)}</select> : <StatusBadge status={String(row[column.key] ?? "Unknown")}/> : column.format === "currency" ? <span className="font-medium tabular-nums text-slate-900">{formatCurrency(row[column.key])}</span> : column.format === "date" ? formatDate(row[column.key]) : <span className={column.key === "name" || column.key === "id" ? "font-medium text-slate-900" : ""}>{String(row[column.key] ?? "—")}</span>}</td>)}<td className="px-4 py-3"><div className="flex justify-end gap-1"><button aria-label="Edit record" onClick={(event) => { event.stopPropagation(); onEdit(row); }} className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"><Pencil className="h-4 w-4"/></button><button aria-label="Delete record" onClick={(event) => { event.stopPropagation(); onDelete(row); }} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4"/></button><button aria-label="More actions" onClick={(event) => event.stopPropagation()} className="rounded p-1.5 text-slate-400 hover:bg-slate-100"><MoreHorizontal className="h-4 w-4"/></button></div></td></tr>) : <tr><td colSpan={columns.length + 1} className="px-4 py-14 text-center"><p className="text-sm font-medium text-slate-800">{query ? "No matching records" : emptyLabel}</p><p className="mt-1 text-xs text-slate-500">{query ? "Try another search term." : "Records will appear here when the API returns data."}</p></td></tr>}</tbody></table></div>
    <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{filteredRows.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredRows.length)} of ${filteredRows.length}` : "0 records"}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><button disabled={page >= pages} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></footer>
  </section>;
}
