import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
        <MessageSquareOff className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Back to home
        </Link>
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
