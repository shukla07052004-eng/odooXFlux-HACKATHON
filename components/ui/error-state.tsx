import { AlertCircle, RefreshCw } from "lucide-react";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><div className="flex-1"><p className="font-medium">We couldn’t load this data</p><p className="mt-1 text-rose-700">{message}</p></div>{onRetry && <button onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"><RefreshCw className="h-3.5 w-3.5"/>Retry</button>}</div>;
}
