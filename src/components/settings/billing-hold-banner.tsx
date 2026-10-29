'use client';

// Bar at the top of the app while the account is on billing hold (Meta
// can't charge the business; lib/whatsapp/billing-hold.ts): says how many
// messages are waiting, links to Meta billing, and — for admins — a
// Resume button for after the card is fixed. Not dismissible: messages
// are waiting. Re-checks every 2 minutes so it disappears by itself
// when the automatic re-check ends the hold.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';

const META_BILLING_URL = 'https://business.facebook.com/billing_hub/payment_settings';
const POLL_MS = 2 * 60_000;

interface HoldState {
  on_hold: boolean;
  waiting_messages?: number;
  waiting_broadcast_recipients?: number;
}

export function BillingHoldBanner() {
  const { accountId, canEditSettings } = useAuth();
  const [hold, setHold] = useState<HoldState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/billing-hold', { cache: 'no-store' });
      if (res.ok) setHold((await res.json()) as HoldState);
    } catch {
      // offline: keep the last state
    }
  }, []);

  useEffect(() => {
    if (!accountId) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [accountId, load]);

  async function resume() {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/billing-hold', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not resume');
      toast.success('Sending the waiting messages now. If Meta still can’t charge your card, they’ll wait again.');
      setHold({ on_hold: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resume');
    } finally {
      setBusy(false);
    }
  }

  if (!hold?.on_hold) return null;

  const waiting = (hold.waiting_messages ?? 0) + (hold.waiting_broadcast_recipients ?? 0);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200"
    >
      <PauseCircle className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <b>Messages paused:</b> Meta couldn’t charge your payment method.{' '}
        {waiting > 0 ? `${waiting} message${waiting === 1 ? ' is' : 's are'} waiting` : 'Templates and broadcasts will wait'}
        {' '}— nothing is lost. Fix the card in{' '}
        <a href={META_BILLING_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
          Meta billing
        </a>
        ; sending resumes by itself within 15 minutes.
      </p>
      {canEditSettings && (
        <button
          type="button"
          onClick={resume}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          I fixed it — resume now
        </button>
      )}
    </div>
  );
}
