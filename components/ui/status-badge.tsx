const tones: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200", paid: "bg-emerald-50 text-emerald-700 ring-emerald-200", succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-200", confirmed: "bg-blue-50 text-blue-700 ring-blue-200", sent: "bg-blue-50 text-blue-700 ring-blue-200", draft: "bg-slate-100 text-slate-600 ring-slate-200", paused: "bg-amber-50 text-amber-700 ring-amber-200", overdue: "bg-rose-50 text-rose-700 ring-rose-200", "past due": "bg-rose-50 text-rose-700 ring-rose-200", expired: "bg-slate-100 text-slate-600 ring-slate-200", closed: "bg-slate-100 text-slate-600 ring-slate-200", quotation: "bg-violet-50 text-violet-700 ring-violet-200", accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status || "Unknown";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[label.toLowerCase()] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{label}</span>;
}
