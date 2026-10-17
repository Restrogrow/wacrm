"use client";

import { BrandMark } from "@/components/brand-mark";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/auth/safe-next";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  // Where to return after signing in (e.g. a /connect consent page).
  const nextPath = safeNextPath(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    // /auth/callback bounces back here when an OAuth or email-link
    // code exchange fails.
    searchParams.get("error") === "auth-callback-failed"
      ? "Sign-in failed. Please try again."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Public demo: typing demo / demo opens the shared demo workspace.
    // The real credentials stay on the server (/api/demo-login).
    const isDemo = email.trim().toLowerCase() === "demo" && password === "demo";
    let authError: string | null = null;
    if (isDemo) {
      const res = await fetch("/api/demo-login", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        authError =
          res.status === 404
            ? "The demo login is not enabled."
            : json.error || "The demo is unavailable right now.";
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      authError = error ? error.message : null;
    }

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    if (inviteToken) {
      router.push(`/join/${encodeURIComponent(inviteToken)}`);
    } else if (nextPath.startsWith("/api/")) {
      // e.g. resuming "Connect Shopify": an API route that redirects to
      // another site needs a full navigation, not a client transition.
      window.location.assign(nextPath);
    } else {
      router.push(nextPath);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-[420px]">
        {/* Logo shows here on small screens; on large screens the brand panel on the left carries it. */}
        <BrandMark className="mb-6 size-12 rounded-2xl lg:hidden" />

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {inviteToken ? "Sign in to accept" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {inviteToken
              ? "Sign in and we'll take you to the invitation."
              : "Sign in to your Repeat Grow account to continue."}
          </p>
        </div>

        <GoogleButton
          next={
            inviteToken
              ? `/join/${encodeURIComponent(inviteToken)}`
              : nextPath
          }
        />
        <AuthDivider label="or sign in with email" />

        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-sm font-semibold text-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-2xl border-border bg-card pl-11 text-base shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 rounded-2xl border-border bg-card pr-12 pl-11 text-base shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
            {!loading && <ArrowRight className="size-4" />}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Just looking around? Type <span className="font-semibold">demo</span> as both email and
          password to explore a sample workspace.
        </p>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={
              inviteToken
                ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                : searchParams.get("next")
                  ? `/signup?next=${encodeURIComponent(nextPath)}`
                  : "/signup"
            }
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
