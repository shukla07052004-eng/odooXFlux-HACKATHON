'use client';

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search, UserPlus, RefreshCw, Eye, Pencil, UserCheck, UserX, X, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/error-state";
import { formatDate } from "@/lib/format";

type UserRole = "admin" | "staff" | "customer";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  address?: string | null;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
};
type UserStats = { total_users: number; total_admins: number; total_staff: number; total_customers: number; active_users: number; inactive_users: number };
type UserForm = { name: string; email: string; password: string; phone: string; company: string; address: string; role: "staff" | "customer" };
type UserResponse = { success?: boolean; message?: string; data?: ManagedUser };
type ListResponse = { success: boolean; data: ManagedUser[]; stats: UserStats; pagination: { page: number; pageSize: number; total: number; totalPages: number }; message?: string };

const emptyStats: UserStats = { total_users: 0, total_admins: 0, total_staff: 0, total_customers: 0, active_users: 0, inactive_users: 0 };
const emptyForm: UserForm = { name: "", email: "", password: "", phone: "", company: "", address: "", role: "staff" };

export default function UsersManagement() {
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<UserStats>(emptyStats);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"new" | "edit" | "view" | null>(null);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [reload, setReload] = useState(0);

  const loadUsers = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: query, role: roleFilter, status: statusFilter });
    try {
      const response = await fetch(`/api/users?${params}`, { cache: "no-store", signal });
      const result = await response.json() as ListResponse;
      if (!response.ok) throw new Error(result.message ?? `Users API returned ${response.status}.`);
      setRows(result.data);
      setStats(result.stats);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load users.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, pageSize, query, roleFilter, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadUsers(controller.signal), query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadUsers, query, reload]);

  function openNew() {
    setSelected(null);
    setForm(emptyForm);
    setDialog("new");
    setError("");
  }

  async function openDetails(user: ManagedUser) {
    setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { cache: "no-store" });
      const result = await response.json() as UserResponse;
      if (!response.ok || !result.data) throw new Error(result.message ?? `User details API returned ${response.status}.`);
      setSelected(result.data);
      setDialog("view");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load user details.");
    }
  }

  function openEdit(user: ManagedUser) {
    setSelected(user);
    setForm({ name: user.name, email: user.email, password: "", phone: user.phone ?? "", company: user.company ?? "", address: user.address ?? "", role: user.role === "customer" ? "customer" : "staff" });
    setDialog("edit");
    setError("");
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const editing = dialog === "edit" && selected !== null;
      const response = await fetch(editing ? `/api/users/${encodeURIComponent(selected.id)}` : "/api/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? (selected.role === "admin" ? { name: form.name, email: form.email, phone: form.phone, company: form.company, address: form.address } : { name: form.name, email: form.email, phone: form.phone, company: form.company, address: form.address, role: form.role }) : { name: form.name, email: form.email, password: form.password, role: form.role, phone: form.phone, company: form.company }),
      });
      const result = await response.json() as UserResponse;
      if (!response.ok || !result.success) throw new Error(result.message ?? `Save failed (${response.status}).`);
      setDialog(null);
      setSelected(null);
      setNotice(result.message ?? (editing ? "User updated." : "Account created."));
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    const action = user.is_active ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} ${user.name}'s account?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const result = await response.json() as UserResponse;
      if (!response.ok || !result.success) throw new Error(result.message ?? `Account update failed (${response.status}).`);
      setNotice(`${user.name}'s account was ${user.is_active ? "deactivated" : "activated"}.`);
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update account status.");
    }
  }

  const statCards = [
    ["Total users", stats.total_users], ["Admins", stats.total_admins], ["Staff", stats.total_staff],
    ["Customers", stats.total_customers], ["Active", stats.active_users], ["Inactive", stats.inactive_users],
  ] as const;

  return <>
    <PageHeader
      eyebrow="ACCESS CONTROL"
      title="User management"
      description="Manage workspace accounts, roles, and account access."
      action={
        <button
          type="button"
          onClick={openNew}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <UserPlus className="h-4 w-4" />
          Add account
        </button>
      }
    />

    {notice && (
      <button
        type="button"
        onClick={() => setNotice("")}
        role="status"
        className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-800"
      >
        {notice} · dismiss
      </button>
    )}

    {error && (
      <ErrorState
        message={error}
        onRetry={() => setReload((value) => value + 1)}
      />
    )}

    <section
      aria-label="User statistics"
      className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
    >
      {statCards.map(([label, value]) => (
        <article
          key={label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {loading ? "—" : value.toLocaleString()}
          </p>
        </article>
      ))}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Workspace users
          </h2>

          <p className="mt-0.5 text-xs text-slate-500">
            {total.toLocaleString()} accounts
          </p>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border border-slate-200 px-2.5 text-slate-400 sm:w-56">
            <Search className="h-4 w-4" />

            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              aria-label="Search users by name or email"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>

          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="customer">Customer</option>
          </select>

          <select
            aria-label="Filter by account status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            type="button"
            aria-label="Refresh users"
            onClick={() => setReload((value) => value + 1)}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left">
          <thead className="bg-slate-50">
            <tr>
              {["User", "Role", "Account status", "Registered", "Actions"].map(
                (label) => (
                  <th
                    key={label}
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${label === "Actions" ? "text-right" : ""
                      }`}
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  Loading users…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">
                      {user.name}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500">
                      {user.email}
                      {user.is_verified ? "" : " · Email unverified"}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                      {user.role}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                        }`}
                    >
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(user.created_at)}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`View ${user.name}`}
                        onClick={() => void openDetails(user)}
                        className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        aria-label={`Edit ${user.name}`}
                        onClick={() => openEdit(user)}
                        className="rounded p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        aria-label={`${user.is_active ? "Deactivate" : "Activate"
                          } ${user.name}`}
                        title={
                          user.is_active
                            ? "Deactivate account"
                            : "Activate account"
                        }
                        onClick={() => void toggleActive(user)}
                        className={`rounded p-1.5 ${user.is_active
                            ? "text-rose-600 hover:bg-rose-50"
                            : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                      >
                        {user.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
                  <p className="text-sm font-medium text-slate-800">
                    No users found
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Try different filters or create an account.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span>
          Page {page} of {totalPages} · {total.toLocaleString()} users
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>

          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </section>

    {dialog === "new" || dialog === "edit" ? (
      <div
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/35 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setDialog(null);
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-form-title"
          className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[.12em] text-slate-500">
                BRIGHTLOOP WORKSPACE
              </p>

              <h2 id="user-form-title" className="mt-1 text-lg font-semibold">
                {dialog === "new" ? "Add account" : "Edit user"}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setDialog(null)}
              aria-label="Close dialog"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <form
            onSubmit={(event) => void saveUser(event)}
            className="space-y-4 p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  maxLength={255}
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              {dialog === "new" && (
                <>
                  <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                    Initial password
                    <input
                      required
                      type="password"
                      minLength={9}
                      maxLength={72}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(event) =>
                        setForm({ ...form, password: event.target.value })
                      }
                      className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />

                    <span className="font-normal text-slate-500">
                      More than 8 characters with uppercase, lowercase, number,
                      and special character.
                    </span>
                  </label>

                  <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                    Account role
                    <select
                      value={form.role}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          role: event.target.value as UserForm["role"],
                        })
                      }
                      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="staff">Staff</option>
                      <option value="customer">Customer</option>
                    </select>
                  </label>
                </>
              )}

              <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                Phone
                <input
                  type="tel"
                  maxLength={40}
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                Company
                <input
                  maxLength={150}
                  autoComplete="organization"
                  value={form.company}
                  onChange={(event) =>
                    setForm({ ...form, company: event.target.value })
                  }
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              {dialog === "edit" && selected?.role !== "admin" && (
                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Role
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        role: event.target.value as UserForm["role"],
                      })
                    }
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="staff">Staff</option>
                    <option value="customer">Customer</option>
                  </select>
                </label>
              )}

              {dialog === "edit" && selected?.role === "admin" && (
                <div className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Role
                  <span className="flex h-10 items-center rounded-md bg-slate-100 px-3 text-sm capitalize text-slate-600">
                    Admin role is protected
                  </span>
                </div>
              )}

              {dialog === "edit" && (
                <label className="grid gap-1.5 text-xs font-medium text-slate-700">
                  Address
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              )}
            </div>

            {dialog === "new" && (
              <p className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                The account is active and verified when created. Share the email
                and initial password with the account holder so they can sign in.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}

            <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="h-9 rounded-md border border-slate-200 px-3 text-sm"
              >
                Cancel
              </button>

              <button
                disabled={saving}
                className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </footer>
          </form>
        </section>
      </div>
    ) : null}

    {dialog === "view" && selected && (
      <div
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/35 p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setDialog(null);
          }
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-detail-title"
          className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <header className="flex justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[.12em] text-slate-500">
                USER DETAILS
              </p>

              <h2 id="user-detail-title" className="mt-1 text-xl font-semibold">
                {selected.name}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setDialog(null)}
              aria-label="Close details"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            {[
              ["Email", selected.email],
              ["Phone", selected.phone],
              ["Company", selected.company],
              ["Role", selected.role],
              ["Account status", selected.is_active ? "Active" : "Inactive"],
              ["Email status", selected.is_verified ? "Verified" : "Unverified"],
              ["Registered", formatDate(selected.created_at)],
              ["Address", selected.address],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">
                  {label}
                </dt>

                <dd className="mt-1 break-words text-slate-900">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>

          <footer className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="h-9 rounded-md border border-slate-200 px-3 text-sm"
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    )}
  </>
}
