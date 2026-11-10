'use client';

// Platform admin: an account's AI credit balance, adding credits, and
// the enforcement switch. Reads and writes
// /api/admin/accounts/[id]/credits.
//
// There is no payment gateway, so adding credits is the same motion as
// activating a plan: the business pays by UPI or bank transfer and
// support records it here. "Paid top-up" vs "Goodwill" is recorded so
// the ledger still reconciles against money actually received.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coins, Loader2 } from 'lucide-react';

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
import { CREDIT_KIND_LABELS, isCreditKind } from '@/lib/credits/credits';

interface LedgerRow {
  id: string;
  credits: number;
  kind: string;
  feature: string | null;
  note: string | null;
  created_at: string;
}

interface State {
  balance: number;
  enforced: boolean;
  available: boolean;
  ledger: LedgerRow[];
}

const KIND_OPTIONS = [
  { value: 'topup', label: 'Paid top-up' },
  { value: 'admin_grant', label: 'Goodwill / make-good' },
];

const n = (value: number) => value.toLocaleString('en-IN');

export function CreditsCard({ accountId }: { accountId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [credits, setCredits] = useState('');
  const [kind, setKind] = useState('topup');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Bumped after a write to pull the balance and ledger again.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/accounts/${accountId}/credits`);
        if (cancelled || !res.ok) return;
        setState((await res.json()) as State);
      } catch {
        // Leave the card showing its last known state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadToken]);

  async function add() {
    const amount = Number(credits);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('Enter a whole number of credits above zero.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: amount, kind, note }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        balance?: number;
      };
      if (!res.ok) {
        toast.error(body.error ?? 'Could not add credits.');
        return;
      }
      toast.success(`Added ${n(amount)} credits. Balance ${n(body.balance ?? 0)}.`);
      setCredits('');
      setNote('');
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function setEnforced(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/credits`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enforced: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? 'Could not change enforcement.');
        return;
      }
      toast.success(
        next
          ? 'Credits are now enforced: AI stops at zero.'
          : 'Credits are measured but not enforced.'
      );
      reload();
    } finally {
      setSaving(false);
    }
  }

  if (state && !state.available) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Coins className="size-4 text-primary" />
          AI credits
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Not available yet — run migration <code>100_ai_credits.sql</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Coins className="size-4 text-primary" />
          AI credits
        </h2>
        <span className="text-2xl font-bold tabular-nums">
          {state ? n(state.balance) : '—'}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {state?.enforced
          ? 'Enforced: AI features stop when this reaches zero. Everything else keeps working.'
          : 'Measured only. Usage is recorded and the balance can go negative, but nothing is blocked — use this to see real consumption before setting the per-plan amounts.'}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grow basis-28">
          <Label htmlFor="credits-amount" className="text-xs">
            Add credits
          </Label>
          <Input
            id="credits-amount"
            type="number"
            min={1}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder="10000"
          />
        </div>
        <div className="grow basis-40">
          <Label className="text-xs">Reason</Label>
          <Select value={kind} onValueChange={(v) => setKind(v ?? 'topup')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grow basis-48">
          <Label htmlFor="credits-note" className="text-xs">
            Note (optional)
          </Label>
          <Input
            id="credits-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="UPI ref, invoice no."
          />
        </div>
        <Button onClick={add} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Add
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          Stop AI at zero for this account
        </span>
        <Button
          variant={state?.enforced ? 'default' : 'outline'}
          size="sm"
          disabled={saving || !state}
          onClick={() => void setEnforced(!state?.enforced)}
        >
          {state?.enforced ? 'Enforced' : 'Not enforced'}
        </Button>
      </div>

      {state && state.ledger.length > 0 && (
        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
            Recent entries
          </h3>
          <ul className="space-y-1 text-xs">
            {state.ledger.slice(0, 10).map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">
                  {isCreditKind(row.kind)
                    ? CREDIT_KIND_LABELS[row.kind]
                    : row.kind}
                  {row.feature ? ` · ${row.feature}` : ''}
                  {row.note ? ` · ${row.note}` : ''}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${row.credits < 0 ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}
                >
                  {row.credits > 0 ? `+${n(row.credits)}` : n(row.credits)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
