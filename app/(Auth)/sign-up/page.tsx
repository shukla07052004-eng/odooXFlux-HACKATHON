"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { errorBoxClass } from "@/styles/formStyles";
import { ShootingStars } from "@/components/customCss/shooting-stars";
import { StarsBackground } from "@/components/customCss/stars-background";
import AuthCard from "@/styles/AuthCard";
import { LayoutTextFlip } from "@/components/customCss/layout-text-flip";
import { motion } from "motion/react";

interface SignupResponse {
    success: boolean;
    message: string;
}

export default function SignupForm() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        setIsLoading(true);

        try {
            const res = await fetch("/api/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: username, email: email.trim().toLowerCase(), password }),
            });

            const data: SignupResponse = await res.json();

            if (!res.ok || !data.success) {
                setError(data.message || "Something went wrong. Please try again.");
                setIsLoading(false);
                return;
            }

            // Send the email along so the user doesn't have to retype it on /verify.
            router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Could not reach the server. Please check your connection.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AuthCard title="Create Your Account" subtitle="Get started in a few seconds">

            <div className="shadow-input mx-auto w-full max-w-xl rounded-none bg-black p-4 md:rounded-2xl md:p-8 dark:bg-black">
                <div className="pointer-events-none absolute inset-0 z-0">
                    <ShootingStars />
                    <StarsBackground />
                </div>

                <div className="relative z-10 mx-auto w-full max-w-xl rounded-2xl bg-white p-4 shadow-input md:p-8 dark:bg-black">

                    <motion.div className="relative mx-4 my-2 flex flex-col items-center justify-center gap-2 text-center sm:mx-0 sm:mb-0 sm:flex-row">
                        <LayoutTextFlip
                            text="Welcome to "
                            words={["Our-App", "Easy", "Beautiful", "handy"]}
                        />
                    </motion.div>
                    <div className="my-8 h-[1px] w-full bg-gradient-to-r from-transparent via-neutral-300 to-transparent dark:via-neutral-700" />

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        {error && <div className={errorBoxClass}>{error}</div>}

                        <div className="mb-4 flex w-full min-w-sm flex-col items-center justify-center space-y-2 md:flex-row md:space-y-0 md:space-x-2">
                            <LabelInputContainer>
                                <Input id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    disabled={isLoading}
                                    autoComplete="username"
                                    required />
                                <Input id="email" placeholder="Email Address" type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                    autoComplete="email"
                                    required
                                />
                                <Input id="password" placeholder="Password" type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    autoComplete="new-password"
                                    required
                                />
                                <button
                                    className="group/btn relative cursor-pointer block h-10 w-full ounded-md bg-gradient-to-br from-black to-neutral-600 font-medium text-white shadow-[0px_1px_0px_0px_#ffffff40_inset,0px_-1px_0px_0px_#ffffff40_inset] dark:bg-zinc-800 dark:from-zinc-900 dark:to-zinc-900 dark:shadow-[0px_1px_0px_0px_#27272a_inset,0px_-1px_0px_0px_#27272a_inset]"
                                    type="submit"
                                    disabled={isLoading}
                                >
                                    {isLoading ? "Creating account…" : "Sign up →"}
                                    <BottomGradient />
                                </button>
                            </LabelInputContainer>
                        </div>


                        <div className="my-8 h-[1px] w-full bg-gradient-to-r from-transparent via-neutral-300 to-transparent dark:via-neutral-700" />

                        
                        <p className="text-center text-sm text-slate-500">
                            Already have an account?{" "}
                            <Link href="/sign-in" className="font-medium text-indigo-600 hover:text-indigo-500">
                                Log in
                            </Link>
                        </p>

                    </form >

                </div>
            </div>
        </AuthCard>
    );
}
const BottomGradient = () => {
    return (
        <>
            <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
            <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
        </>
    );
};
const LabelInputContainer = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return (
        <div className={cn("flex min-w-sm flex-col space-y-2", className)}>
            {children}
        </div>
    );
};
