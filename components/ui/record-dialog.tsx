'use client';

import { type FormEvent } from "react";
import { X } from "lucide-react";
import type { FormFieldDefinition } from "@/types/billing";

export function RecordDialog({ title, fields, initialValues = {}, onClose, onSubmit, saving = false }: {
  title: string;
  fields: FormFieldDefinition[];
  initialValues?: Record<string, unknown>;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  saving?: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    void onSubmit(values);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="record-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-semibold tracking-[.12em] text-slate-500">BRIGHTLOOP WORKSPACE</p><h2 id="record-dialog-title" className="mt-1 text-lg font-semibold text-slate-900">{title}</h2></div><button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button></header>
      <form onSubmit={submit} className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className={`flex flex-col gap-1.5 text-xs font-medium text-slate-700 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>{field.label}{field.options ? <select name={field.key} required={field.required} defaultValue={String(initialValues[field.key] ?? field.options[0])} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea name={field.key} rows={3} required={field.required} defaultValue={String(initialValues[field.key] ?? "")} placeholder={field.placeholder} className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/> : <input name={field.key} type={field.type ?? "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "any" : undefined} required={field.required} defaultValue={String(initialValues[field.key] ?? "")} placeholder={field.placeholder} className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/>}</label>)}</div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button disabled={saving} className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? "Saving…" : "Save record"}</button></div></form>
    </section>
  </div>;
}
