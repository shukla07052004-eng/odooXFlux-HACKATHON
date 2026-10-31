"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp"
import AuthCard from "@/styles/AuthCard";
import {
  inputClass,
  labelClass,
  buttonClass,
  errorBoxClass,
  successBoxClass,
} from "@/styles/formStyles";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { ShootingStars } from "@/components/customCss/shooting-stars";
import { StarsBackground } from "@/components/customCss/stars-background";

interface VerifyResponse {
  success: boolean;
  message: string;
}


export default function VerifyForm() {
  const router = useRouter();

  const [code, setCode] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const email = searchParams.get("email");


  async function handleSubmit(e: any) {
    e.preventDefault();

    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/validCode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          code,
        }),
      });

      const data: VerifyResponse = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Verification failed. Please try again.");
        setIsLoading(false);
        return;
      }

      setSuccess(
        data.message || "Email verified! Redirecting to login..."
      );

      router.push("/dashboard");

    } catch {
      setError("Could not reach the server. Please check your connection.");
      setIsLoading(false);
    }

  }


  return (
    <AuthCard title="Verify your account" subtitle="Get started in a few seconds">

      <div className="shadow-input mx-auto w-full max-w-xl rounded-none bg-black p-4 md:rounded-2xl md:p-8 dark:bg-black">
        <div className="pointer-events-none absolute inset-0 z-0">
          <ShootingStars />
          <StarsBackground />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <div className={errorBoxClass}>{error}</div>}
          {success && <div className={successBoxClass}>{success}</div>}


          <div className="mb-4 flex w-full min-w-sm flex-col items-center justify-center space-y-2 gap-2">

            <div>
              <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                value={code}
                onChange={(value) => setCode(value)}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <button type="submit" className={buttonClass} disabled={isLoading}>
              {isLoading ? "Verifying..." : "Verify"}
            </button>

            <p className="text-center text-sm text-slate-500">
              Wrong Username?{" "}
              <Link href="/sign-up" className="font-medium text-indigo-600 hover:text-indigo-500">
                Back to signup
              </Link>
            </p>
          </div>
        </form>
      </div>
    </AuthCard>
  )
}




















