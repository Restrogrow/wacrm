"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { isStaleBuildError, reloadOnceForStaleBuild } from "@/lib/stale-build";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleBuildError(error);

  useEffect(() => {
    // No error-monitoring service wired up yet — this is the only
    // record of the failure until one is. Keep it a plain console.error
    // rather than swallowing it.
    console.error("[app error boundary]", error);
    // Old JS from before a deploy — a reload picks up the new build.
    if (stale) reloadOnceForStaleBuild();
  }, [error, stale]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10">
        <TriangleAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {stale ? "A new version is available" : "Something went wrong"}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {stale
            ? "Repeat Grow was just updated. Reload the page to continue."
            : "An unexpected error occurred. Try again, or reach out if it keeps happening."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : reset())}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          {stale ? "Reload" : "Try again"}
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
