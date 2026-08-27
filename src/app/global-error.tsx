"use client";

import { useEffect } from "react";
import "./globals.css";

// Only fires when the root layout itself throws — everything else is
// caught by error.tsx. Deliberately minimal (no ThemeProvider, no
// custom font, no other app imports) since this is the last line of
// defense and can't afford to fail itself.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="flex h-full min-h-screen flex-col items-center justify-center gap-6 bg-[#020617] px-4 text-center font-sans text-white">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Something went wrong
          </h1>
          <p className="max-w-sm text-sm text-white/60">
            Repeat Grow hit an unexpected error. Try reloading — if it
            keeps happening, reach out at support.repeatgrow@gmail.com.
          </p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-3 text-sm font-medium text-black hover:bg-white/80"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
