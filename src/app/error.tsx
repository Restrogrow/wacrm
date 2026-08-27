"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error-monitoring service wired up yet — this is the only
    // record of the failure until one is. Keep it a plain console.error
    // rather than swallowing it.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
        <TriangleAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. Try again, or reach out if it
          keeps happening.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Try again
        </button>
        <Link
          href="/contact"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
