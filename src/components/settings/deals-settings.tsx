"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES, formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Deals settings — account-wide default currency.
 *
 * One currency per account (issue #218): the chosen code seeds new
 * deals and formats every aggregated total. Existing deals keep their
 * own saved currency. Writes go straight to `accounts.default_currency`;
 * the `accounts_update` RLS policy (017) already restricts that to
 * admins+, so non-admins see a disabled, read-only control.
 */
export function DealsSettings() {
  const supabase = createClient();
  const {
    accountId,
    defaultCurrency,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();

  const [selected, setSelected] = useState(defaultCurrency);
  const [saving, setSaving] = useState(false);

  // Keep the select in sync once the profile (and its account default)
  // resolves, and after a save round-trips through refreshProfile.
  useEffect(() => {
    setSelected(defaultCurrency);
  }, [defaultCurrency]);

  const dirty = selected !== defaultCurrency;

  async function handleSave() {
    if (!accountId || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from("accounts")
      .update({ default_currency: selected })
      .eq("id", accountId);
    if (error) {
      toast.error("Failed to save default currency");
      setSaving(false);
      return;
    }
    // Pull the new value back into the auth context so the deal form
    // and every total pick it up without a full reload.
    await refreshProfile();
    setSaving(false);
    toast.success("Default currency updated");
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Coins}
        title="Deals & currency"
        description="The currency used for new deals and for pipeline and dashboard totals."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Coins className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-bold tracking-tight text-foreground">Default currency</h3>
                <p className="text-xs text-muted-foreground">
                  New deals default to this currency, and pipeline and dashboard totals are shown in it. Existing deals
                  keep the currency they were saved with.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-sm">
              <Label className="text-muted-foreground">Currency</Label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!canEditSettings || profileLoading}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.label}
                  </option>
                ))}
              </select>
              {!canEditSettings && (
                <p className="text-xs text-muted-foreground">Only account admins can change the default currency.</p>
              )}
            </div>

            {canEditSettings && (
              <Button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--rail)] via-primary to-emerald-400 p-6 text-white shadow-lg">
          <div className="pointer-events-none absolute -top-12 -right-12 size-48 rounded-full bg-white/10 blur-2xl" />
          <p className="relative text-xs font-bold tracking-wider text-white/75 uppercase">How totals will look</p>
          <p className="relative mt-3 text-4xl font-bold tracking-tight tabular-nums">{formatCurrency(125000, selected)}</p>
          <p className="relative mt-1 text-sm text-white/80">Sample pipeline value</p>
          <div className="relative mt-5 space-y-2">
            {[
              ["Festive combo", 1499],
              ["Wholesale order", 42000],
            ].map(([label, amount]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-2xl bg-white/15 px-4 py-2.5 text-sm backdrop-blur">
                <span>{label}</span>
                <span className="font-bold tabular-nums">{formatCurrency(Number(amount), selected)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
