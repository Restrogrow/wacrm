'use client';

// Chrome for the agent portal.
//
// Deliberately NOT the customer dashboard's shell. A partner is not a
// Repeat Grow customer: they have no inbox, no contacts, no WhatsApp
// number and no account to bill. Reusing DashboardShell would surround
// them with a sidebar full of things they can't open, and would drag in
// AuthProvider, CallProvider, PresenceHeartbeat and the plan/billing
// banners — all of which assume an `accounts` row this login doesn't
// have. So this is its own small frame: a header, the brand, sign out.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Handshake, LogOut, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export function AgentShell({
  children,
  partnerName,
}: {
  children: React.ReactNode;
  partnerName: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/agent" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Handshake className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold tracking-tight text-foreground">
                Partner dashboard
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {partnerName}
              </span>
            </span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogOut className="size-3.5" />
            )}
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted-foreground sm:px-6">
        Questions about a payout or a client?{' '}
        <a
          href="mailto:support@repeatgrow.com"
          className="font-medium text-primary hover:underline"
        >
          support@repeatgrow.com
        </a>
      </footer>
    </div>
  );
}
