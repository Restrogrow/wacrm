"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

/**
 * Second step of sign-in for people who turned on two-factor login.
 * The proxy sends a password-only (aal1) session here until a 6-digit
 * authenticator code is verified (which upgrades the session to aal2).
 */
export default function MfaChallengePage() {
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const next = () =>
    safeNextPath(new URLSearchParams(window.location.search).get("next")) || "/dashboard";

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.assign("/login");
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") {
        // Nothing to challenge (no factor, or already verified).
        window.location.assign(next());
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) {
        window.location.assign(next());
        return;
      }
      setFactorId(totp.id);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setLoading(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setError(cErr?.message ?? "Could not start the check. Please try again.");
      setLoading(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) {
      setError("That code didn't work. Check the 6 digits in your authenticator app and try again.");
      setCode("");
      setLoading(false);
      return;
    }
    // Full navigation so the server sees the upgraded (aal2) session cookies.
    window.location.assign(next());
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[420px]">
        <BrandMark className="mb-6 size-12 rounded-2xl lg:hidden" />
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
            <ShieldCheck className="size-7 text-primary" /> Two-step check
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Open your authenticator app and enter the 6-digit code for Repeat Grow.
          </p>
        </div>

        <form onSubmit={verify} className="flex flex-col gap-5">
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="code" className="text-sm font-semibold text-foreground">
              Authenticator code
            </Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={!ready}
              autoFocus
              required
              className="h-12 rounded-2xl border-border bg-card text-center text-2xl tracking-[0.5em] shadow-sm"
            />
          </div>
          <Button
            type="submit"
            disabled={!ready || loading || code.length !== 6}
            className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Verify and continue"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Not you, or lost your device?{" "}
          <button
            type="button"
            onClick={signOut}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
