'use client';

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCard from "@/styles/AuthCard";
import { errorBoxClass, successBoxClass } from "@/styles/formStyles";
import { Input } from "@/components/ui/input";

type LoginResponse = { success: boolean; message: string; user?: { role: "admin" | "staff" | "customer" } };
function SignInForm() {
  const router = useRouter(); const search = useSearchParams();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const verified = search.get("verified") === "1"; const reset = search.get("passwordReset") === "1";
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); try { const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }); const result = await response.json() as LoginResponse; if (!response.ok || !result.success || !result.user) { setError(result.message || "Unable to sign in."); return; } router.replace(result.user.role === "customer" ? "/account" : "/dashboard"); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reach the sign-in service."); } finally { setLoading(false); } }
  return <AuthCard title="Sign in to Brightloop" subtitle="Manage subscriptions and billing in one workspace."><div className="mx-auto mt-7 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl md:p-8">
    {verified && <div role="status" className={`${successBoxClass} mb-4`}>Email verified. Sign in to continue.</div>}{reset && <div role="status" className={`${successBoxClass} mb-4`}>Password updated. Sign in with your new password.</div>}{error && <div role="alert" className={`${errorBoxClass} mb-4`}>{error}</div>}
    <form onSubmit={submit} className="space-y-4"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Email address<Input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={loading}/></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Password<Input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading}/></label><div className="flex justify-end"><Link href="/forgot-password" className="text-sm font-medium text-indigo-600">Forgot password?</Link></div><button disabled={loading} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button></form>
    <p className="mt-6 text-center text-sm text-slate-500">New to Brightloop? <Link href="/sign-up" className="font-medium text-indigo-600">Create account</Link></p>
  </div></AuthCard>;
}

export default function SignInPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-black text-white">Loading sign in…</main>}><SignInForm/></Suspense>;
}
