"use client";

import { BrandMark } from "@/components/brand-mark";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

import type { OnboardingState } from "@/lib/auth/onboarding";
import {
  NATURE_OF_BUSINESS_OPTIONS,
  TEAM_SIZE_OPTIONS,
} from "@/lib/auth/business-profile";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const inputClassName =
  "h-12 rounded-2xl border-border bg-card text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";

export function OnboardingForm({ initial }: { initial: OnboardingState }) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [mobileNumber, setMobileNumber] = useState(initial.mobileNumber);
  const [natureOfBusiness, setNatureOfBusiness] = useState(
    initial.natureOfBusiness,
  );
  const [teamSize, setTeamSize] = useState(initial.teamSize);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!natureOfBusiness) {
      setError("Please select the nature of your business");
      return;
    }
    if (!teamSize) {
      setError("Please select your team size");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/account/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName,
        business_name: businessName,
        mobile_number: mobileNumber,
        nature_of_business: natureOfBusiness,
        team_size: teamSize,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not save your details");
      setLoading(false);
      return;
    }

    // The dashboard layout re-checks onboarding on the way in.
    router.push("/dashboard");
    router.refresh();
  };

  const handleSignOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-xl border-0 bg-transparent shadow-none ring-0">
        <CardHeader className="items-start px-0 pb-2 text-left">
          <BrandMark className="mb-4 size-12 rounded-2xl lg:hidden" />
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Tell us about your business
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            A few details to finish setting up your Repeat Grow account
            {initial.email && (
              <>
                {" "}for <span className="text-foreground">{initial.email}</span>
              </>
            )}
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

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
                  autoComplete="name"
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
                  autoComplete="organization"
                  className={inputClassName}
                />
              </div>
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
                  autoComplete="tel"
                  className={inputClassName}
                />
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

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Continue to dashboard"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Wrong account?{" "}
            <button
              type="button"
              onClick={handleSignOut}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
