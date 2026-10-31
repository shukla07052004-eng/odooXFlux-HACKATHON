'use client';

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import AuthCard from "@/styles/AuthCard";
import { errorBoxClass, successBoxClass } from "@/styles/formStyles";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Input } from "@/components/ui/input";

type ApiResponse = { success: boolean; message: string; resetToken?: string };

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const response = await fetch("/api/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success) { setError(result.message || "Could not send a reset code."); return; }
      setStep("code"); setMessage(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reach the password reset service."); }
    finally { setLoading(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (code.length !== 6) { setError("Enter the complete 6-digit code."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), code, purpose: "password_reset" }) });
      const result = await response.json() as ApiResponse;
      if (!response.ok || !result.success || !result.resetToken) { setError(result.message || "Invalid or expired code."); return; }
      sessionStorage.setItem("brightloopResetToken", result.resetToken);
      router.push("/reset-password");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reach the verification service."); }
    finally { setLoading(false); }
  }

  return <AuthCard title="Reset your password" subtitle={step === "email" ? "We’ll email you a one-time verification code." : `Enter the code sent to ${email}.`}>
    <div className="mx-auto mt-7 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl md:p-8">
      {error && <div role="alert" className={`${errorBoxClass} mb-4`}>{error}</div>}{message && <div role="status" className={`${successBoxClass} mb-4`}>{message}</div>}
      {step === "email" ? <form onSubmit={requestCode} className="space-y-4"><label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Account email</label><Input id="reset-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading}/><button className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={loading}>{loading ? "Sending code…" : "Send reset code"}</button></form> : <><form onSubmit={verifyCode} className="flex flex-col items-center gap-5"><InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode} disabled={loading}><InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index}/>)}</InputOTPGroup></InputOTP><button className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={loading || code.length !== 6}>{loading ? "Checking code…" : "Continue"}</button></form><button type="button" onClick={() => { setStep("email"); setCode(""); }} className="mt-4 text-sm font-medium text-indigo-600">Send a new code</button></>}
      <p className="mt-6 text-center text-sm text-slate-500"><Link href="/sign-in" className="font-medium text-indigo-600">Back to sign in</Link></p>
    </div>
  </AuthCard>;
}
