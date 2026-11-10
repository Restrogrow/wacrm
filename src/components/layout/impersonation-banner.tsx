'use client';

// Bar across the top of the app while a platform admin is signed in as
// a customer (see lib/auth/impersonation.ts). Deliberately loud and not
// dismissible: the admin has the customer's full access here, so every
// screen should keep saying whose account this is before they type
// something into it.

import { useEffect, useState } from 'react';
import { Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface State {
  impersonating: boolean;
  admin_email?: string | null;
  account_name?: string;
  member_email?: string | null;
}

export function ImpersonationBanner() {
  const [state, setState] = useState<State | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/impersonation', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as State;
        if (!cancelled) setState(json);
      } catch {
        // offline — no banner rather than a wrong one
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function exit() {
    setLeaving(true);
    try {
      const res = await fetch('/api/admin/impersonation', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not sign out');
      // Hard navigation, not router.push: we just signed the customer
      // session out, so every cached client query and the in-memory auth
      // context belong to a user who no longer has a session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign out');
      setLeaving(false);
    }
  }

  if (!state?.impersonating) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-fuchsia-500/40 bg-fuchsia-500/15 px-4 py-2 text-sm text-fuchsia-950 dark:text-fuchsia-100"
    >
      <ShieldAlert className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <b>Signed in as a customer.</b> You are using{' '}
        <b>{state.account_name}</b>
        {state.member_email ? ` (${state.member_email})` : ''} with full access — anything you
        change here is a real change to their account.
        {state.admin_email ? ` Started by ${state.admin_email}.` : ''}
      </p>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="flex items-center gap-1.5 rounded-lg bg-fuchsia-700 px-3 py-1 text-xs font-semibold text-white hover:bg-fuchsia-800 disabled:opacity-60"
      >
        {leaving ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
        Exit customer account
      </button>
    </div>
  );
}
