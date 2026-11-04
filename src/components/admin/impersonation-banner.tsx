'use client';

// Bar at the top of the app while a platform admin is signed in as a
// customer. Two jobs: make it impossible to forget you're acting as
// somebody else (anything you send goes out on their WhatsApp number,
// under their name), and provide the way back — the admin's own session
// was overwritten to get here, so without this button the only exit is
// signing in again.
//
// Fetches its own state like PlanBanner and BillingHoldBanner do. The
// state can't be computed client-side: it needs the httpOnly token
// cookie and the service-role client, so it comes from
// GET /api/admin/impersonate/status. Renders nothing for everyone else,
// which is almost everyone — hence the single fetch and no polling.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import type { ImpersonationState } from '@/lib/auth/impersonation';

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/impersonate/status', {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setState(json.impersonation ?? null);
      } catch {
        // Offline or the migration isn't applied: show no banner. The
        // cost of a false negative is a missing warning, so this is
        // worth being quiet about rather than toasting on every load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!state) return null;

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/impersonate/stop', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not stop impersonating');
      // Full reload for the same reason as the "Log in as" button: the
      // session cookies just changed back.
      window.location.href = json.redirectTo ?? '/admin';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not stop impersonating');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm sm:px-6">
      <ShieldAlert className="size-4 shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1 text-amber-900 dark:text-amber-100">
        Viewing as{' '}
        <span className="font-semibold">{state.targetEmail ?? 'this user'}</span>
        {state.accountName && <> in {state.accountName}</>}
        {state.adminEmail && (
          <span className="opacity-70"> · signed in as {state.adminEmail}</span>
        )}
        . Anything you send goes out as them.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={stop}
        disabled={busy}
        className="h-7 shrink-0 gap-1.5 border-amber-500/50 bg-transparent hover:bg-amber-500/20"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        Stop impersonating
      </Button>
    </div>
  );
}
