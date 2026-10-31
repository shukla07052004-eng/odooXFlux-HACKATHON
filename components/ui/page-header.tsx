import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-slate-500">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>
    {action}
  </header>;
}
