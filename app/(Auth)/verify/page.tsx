'use client';

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import AuthCard from "@/styles/AuthCard";
import { buttonClass, errorBoxClass, successBoxClass } from "@/styles/formStyles";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type ApiResponse = { success: boolean; message: string };

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (!email || code.length !== 6) { setError("Enter the email used to sign up and the complete 6-digit code."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, purpose: "signup" }) });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success) { setError(result.message || "Verification failed."); return; }
      setMessage(result.message);
      router.replace("/sign-in?verified=1");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reach the verification service."); }
    finally { setLoading(false); }
  }

  async function resend() {
    setError(""); setMessage(""); setLoading(true);
    try {
      const response = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, purpose: "signup", mode: "resend" }) });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success) { setError(result.message || "Could not resend the code."); return; }
      setMessage(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reach the verification service."); }
    finally { setLoading(false); }
  }

  return <AuthCard title="Verify your account" subtitle={email ? `Enter the code sent to ${email}` : "Enter the email address used to sign up."}>
    <div className="mx-auto mt-7 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl md:p-8">
      {error && <div role="alert" className={`${errorBoxClass} mb-4`}>{error}</div>}
      {message && <div role="status" className={`${successBoxClass} mb-4`}>{message}</div>}
      <form onSubmit={verify} className="flex flex-col items-center gap-5">
        <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} disabled={loading} aria-label="Verification code"><InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index}/>)}</InputOTPGroup></InputOTP>
        <button type="submit" className={buttonClass} disabled={loading || !email || code.length !== 6}>{loading ? "Verifying…" : "Verify email"}</button>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm"><button type="button" onClick={resend} disabled={loading || !email} className="font-medium text-indigo-600 disabled:opacity-50">Resend code</button><Link href="/sign-up" className="text-slate-600 hover:text-indigo-600">Back to signup</Link></div>
    </div>
  </AuthCard>;
}

export default function VerifyPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-black text-white">Loading verification…</main>}><VerifyForm/></Suspense>;
}
