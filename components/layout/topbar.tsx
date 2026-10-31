'use client';

import { Bell, Menu, Search } from "lucide-react";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth/session";

export function Topbar({ title, onMenu, user }: { title: string; onMenu: () => void; user: SessionUser }) {
  const [query, setQuery] = useState("");
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      {/* Left Section: Navigation and Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Workspace</span>
          <span>/</span>
          <b className="font-medium text-slate-700">
            {title}
          </b>
        </div>
      </div>

      {/* Right Section: Search, Notifications, and User Profile */}
      <div className="flex items-center gap-3">
        <label className="hidden h-9 w-60 items-center gap-2 rounded-md border border-slate-200 px-2.5 text-slate-400 sm:flex">
          <Search className="h-4 w-4" />

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search anything…"
            aria-label="Global search"
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
          />

          <kbd className="rounded border border-slate-200 px-1 py-0.5 text-[9px]">
            ⌘ K
          </kbd>
        </label>

        <button
          aria-label="Notifications"
          className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
        >
          <Bell className="h-4 w-4" />

          <i className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>

        <span className="hidden h-6 border-l border-slate-200 sm:block" />

        {/* User Profile */}
        <span className="flex items-center gap-2 rounded-md px-1 py-1 text-xs font-medium text-slate-700">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-100 text-[10px] font-bold uppercase text-amber-800">
            {user.name.slice(0, 2)}
          </span>

          <span className="hidden capitalize sm:inline">
            {user.role}
          </span>
        </span>
      </div>
    </header>
  );
}
