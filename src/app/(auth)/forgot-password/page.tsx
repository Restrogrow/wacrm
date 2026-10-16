"use client";

import { BrandMark } from "@/components/brand-mark";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, CheckCircle, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none ring-0">
          <CardHeader className="items-start px-0 text-left">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
              Check your email
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              We&apos;ve sent a password reset link to{" "}
              <span className="text-foreground">{email}</span>. Please check your
              inbox.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Link href="/login">
              <Button
                variant="outline"
                className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Back to sign in
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[420px] border-0 bg-transparent shadow-none ring-0">
        <CardHeader className="items-start px-0 text-left">
          <BrandMark className="mb-4 h-12 w-12 rounded-2xl lg:hidden" />
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">Reset password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-2xl border-border bg-card text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
