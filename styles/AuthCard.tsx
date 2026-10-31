import { ReactNode } from "react";
import "@/app/globals.css";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Shared visual wrapper for the signup / verify / login cards.
 * Keeps spacing, borders and typography consistent across all auth pages.
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
<div className="flex min-h-screen w-full items-center justify-center michroma-regular bg-black px-4 py-12">
      <div className="w-full max-w-2xl ">
        <div className=" bg-black p-8 shadow-sm ">
          <div className=" text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-md text-slate-500">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}