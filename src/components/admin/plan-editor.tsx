'use client';

// Platform admin: set an account's plan, trial end and paid-until date
// (no payment gateway yet — activate plans here once a business pays).
// Saves via PATCH /api/admin/accounts/[id]/plan.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PLAN_OPTIONS = [
  { value: 'trial', label: 'Free trial' },
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

/** ISO → yyyy-mm-dd for <input type="date">. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
/** yyyy-mm-dd → end of that day in IST, as ISO. */
const fromDateInput = (value: string) =>
  value ? new Date(`${value}T23:59:59+05:30`).toISOString() : null;

export function PlanEditor({
  accountId,
  plan,
  trialEndsAt,
  planExpiresAt,
  billingNote,
}: {
  accountId: string;
  plan: string;
  trialEndsAt: string | null;
  planExpiresAt: string | null;
  billingNote: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(plan);
  const [trialEnd, setTrialEnd] = useState(toDateInput(trialEndsAt));
  const [paidUntil, setPaidUntil] = useState(toDateInput(planExpiresAt));
  const [note, setNote] = useState(billingNote ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: value,
          trial_ends_at: fromDateInput(trialEnd),
          plan_expires_at: fromDateInput(paidUntil),
          billing_note: note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      toast.success('Plan updated');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border bg-card space-y-4 rounded-lg border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Plan</Label>
          <Select value={value} onValueChange={(v) => setValue(v ?? 'trial')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trial-end" className="text-muted-foreground text-xs">
            Trial ends
          </Label>
          <Input
            id="trial-end"
            type="date"
            value={trialEnd}
            onChange={(e) => setTrialEnd(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paid-until" className="text-muted-foreground text-xs">
            Paid until (blank = no end)
          </Label>
          <Input
            id="paid-until"
            type="date"
            value={paidUntil}
            onChange={(e) => setPaidUntil(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="billing-note" className="text-muted-foreground text-xs">
          Note (internal)
        </Label>
        <Input
          id="billing-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Paid ₹999 via UPI on 14 Oct, ref 1234"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save plan
        </Button>
      </div>
    </div>
  );
}
