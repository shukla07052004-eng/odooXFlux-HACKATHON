'use client';

import { useState, type FormEvent } from "react";
import Link from "next/link";
import AuthCard from "@/styles/AuthCard";
import { errorBoxClass, successBoxClass } from "@/styles/formStyles";
import { Input } from "@/components/ui/input";

type ApiResponse = { success: boolean; message: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success) throw new Error(result.message || "Could not request a reset link.");
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reach the password reset service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Reset your password" subtitle="We’ll send a one-time reset link to your registered email.">
      <div className="mx-auto mt-7 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl md:p-8">
        {error && <div role="alert" className={`${errorBoxClass} mb-4`}>{error}</div>}
        {message && <div role="status" className={`${successBoxClass} mb-4`}>{message}</div>}
        <form onSubmit={requestReset} className="space-y-4">
          <label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Account email</label>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} />
          <button className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={loading}>{loading ? "Sending link…" : "Send reset link"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500"><Link href="/sign-in" className="font-medium text-indigo-600">Back to sign in</Link></p>
      </div>
    </AuthCard>
  );
}
