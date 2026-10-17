"use client";

import { BrandMark } from "@/components/brand-mark";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError, useTurnstile } from "@/components/auth/turnstile";
import { safeNextPath } from "@/lib/auth/safe-next";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import {
  NATURE_OF_BUSINESS_OPTIONS,
  TEAM_SIZE_OPTIONS,
} from "@/lib/auth/business-profile";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, CheckCircle, UsersRound, Eye, EyeOff } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  // When the user lands here from `/join/<token>` we carry the
  // invite token in the query so it survives the signup → email
  // verification → redirect round-trip. `emailRedirectTo` below
  // points back at /join/<token> so the user lands on the redeem
  // step after verifying instead of being dropped on /dashboard.
  const inviteToken = searchParams.get("invite");
  // Where to go once signed up (e.g. resuming "Connect Shopify" for a
  // merchant who arrived from the Shopify App Store). Same-origin only.
  const hasNext = searchParams.has("next");
  const nextPath = safeNextPath(searchParams.get("next"));
  // Invited teammates join an existing business, so they only need
  // name + email + password. The business fields describe the account
  // they're joining (already set up by the owner) — and handle_new_user
  // treats them as optional, so leaving them out is safe.
  const isInvite = !!inviteToken;

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [natureOfBusiness, setNatureOfBusiness] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();
  const captcha = useTurnstile();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isInvite && !natureOfBusiness) {
      setError("Please select the nature of your business");
      return;
    }

    if (!isInvite && !teamSize) {
      setError("Please select your team size");
      return;
    }

    if (!isInvite && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    // Invited teammates verify their email like everyone else. (Creating
    // them pre-confirmed let anyone with an invite link, including one
    // minted in their own account, register someone else's email.)
    // If we have an invite token, point Supabase's verification
    // email back at the join page so the user can accept after
    // verifying. Without a token, Supabase uses its default
    // redirect (the app root).
    // With a `next`, the confirmation link goes through /auth/callback,
    // which signs them in and continues there.
    const emailRedirectTo = inviteToken
      ? `${window.location.origin}/join/${encodeURIComponent(inviteToken)}`
      : hasNext
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
        : undefined;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: isInvite
          ? { full_name: fullName }
          : {
              full_name: fullName,
              business_name: businessName,
              mobile_number: mobileNumber,
              nature_of_business: natureOfBusiness,
              team_size: teamSize,
            },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
        ...captcha.captchaOptions,
      },
    });

    if (error) {
      // The signup guard (migration 061) rejects disposable emails and
      // mailboxes that already had a trial; Supabase surfaces that as a
      // generic "Database error saving new user".
      captcha.reset();
      setError(
        /signup_blocked|database error saving new user/i.test(error.message)
          ? 'We could not create an account with this email. Use your real work email, or log in if you already have an account. Need help? Email support@repeatgrow.com.'
          : friendlyAuthError(error.message),
      );
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
              We&apos;ve sent a confirmation link to{" "}
              <span className="text-foreground">{email}</span>. Please check your
              inbox and click the link to verify your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
            >
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

  const inputClassName =
    "h-12 rounded-2xl border-border bg-card text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className={`w-full border-0 bg-transparent shadow-none ring-0 ${isInvite ? "max-w-md" : "max-w-xl"}`}>
        <CardHeader className="items-start px-0 pb-2 text-left">
          <BrandMark className="mb-4 size-12 rounded-2xl lg:hidden" />
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            {inviteToken ? "Create account & join" : "Create account"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? "Your name, email and a password. Confirm your email and you'll join your team."
              : "Get started with Repeat Grow"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <GoogleButton
            next={
              inviteToken
                ? `/join/${encodeURIComponent(inviteToken)}`
                : nextPath
            }
          />
          <AuthDivider label="or sign up with email" />

          <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {isInvite ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fullName" className="text-sm font-semibold text-foreground">
                    Your name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    className={inputClassName}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
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
                    autoComplete="email"
                    className={inputClassName}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className={`${inputClassName} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
            <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fullName" className="text-sm font-semibold text-foreground">
                  Full name
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className={inputClassName}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="businessName" className="text-sm font-semibold text-foreground">
                  Business name
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="Acme Inc."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  className={inputClassName}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
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
                  className={inputClassName}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mobileNumber" className="text-sm font-semibold text-foreground">
                  Mobile number
                </Label>
                <Input
                  id="mobileNumber"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  required
                  className={inputClassName}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="natureOfBusiness" className="text-sm font-semibold text-foreground">
                  Nature of business
                </Label>
                <Select
                  value={natureOfBusiness}
                  onValueChange={(value) => setNatureOfBusiness(value ?? "")}
                >
                  <SelectTrigger id="natureOfBusiness" className="h-12 w-full rounded-2xl border-border bg-card px-4 text-base shadow-sm data-[size=default]:h-12">
                    <SelectValue placeholder="Select your industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {NATURE_OF_BUSINESS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="teamSize" className="text-sm font-semibold text-foreground">
                  Team size
                </Label>
                <Select
                  value={teamSize}
                  onValueChange={(value) => setTeamSize(value ?? "")}
                >
                  <SelectTrigger id="teamSize" className="h-12 w-full rounded-2xl border-border bg-card px-4 text-base shadow-sm data-[size=default]:h-12">
                    <SelectValue placeholder="Select team size" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${inputClassName} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
                  Confirm password
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`${inputClassName} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            </>
            )}

            {captcha.widget}

            <Button
              type="submit"
              disabled={loading}
              className="mt-1.5 h-11 w-full rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50"
            >
              {loading
                ? isInvite
                  ? "Joining your team..."
                  : "Creating account..."
                : isInvite
                  ? "Create account & join"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : hasNext
                    ? `/login?next=${encodeURIComponent(nextPath)}`
                    : "/login"
              }
              className="text-primary hover:text-primary/80"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
