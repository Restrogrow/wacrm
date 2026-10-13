'use client';

// Thin warning bar at the top of the app when the WhatsApp number is at
// risk (quality yellow/red, limited or blocked). Reads the stored daily
// check (RLS) — no Meta call on page load. Dismissible per session.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'rg:number-health-dismissed';

function assess(h: { quality_rating: string | null; can_send: string | null }): {
  level: 'warning' | 'critical' | null;
  text: string;
} {
  const q = (h.quality_rating ?? '').toUpperCase();
  const s = (h.can_send ?? '').toUpperCase();
  if (s === 'BLOCKED') return { level: 'critical', text: 'WhatsApp has blocked your number from sending messages.' };
  if (q === 'RED') return { level: 'critical', text: 'Your WhatsApp number’s quality is low — Meta may limit it soon.' };
  if (s === 'LIMITED') return { level: 'warning', text: 'WhatsApp has limited what your number can send.' };
  if (q === 'YELLOW') return { level: 'warning', text: 'Your WhatsApp number’s quality dropped to medium.' };
  return { level: null, text: '' };
}

export function NumberHealthBanner() {
  const { accountId } = useAuth();
  const [state, setState] = useState<{ level: 'warning' | 'critical' | null; text: string; key: string } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return typeof window === 'undefined' ? null : sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null; // storage blocked — banner just can't be dismissed for the session
    }
  });

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    createClient()
      .from('whatsapp_number_health')
      .select('quality_rating, can_send, checked_at')
      .eq('account_id', accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const a = assess(data);
        setState({ ...a, key: `${data.quality_rating}:${data.can_send}` });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (!state?.level || dismissed === state.key) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 border-b px-4 py-2 text-sm',
        state.level === 'critical'
          ? 'border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {state.text}{' '}
        <Link href="/settings?tab=whatsapp" className="font-medium underline underline-offset-4">
          See number health
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(state.key);
          try {
            sessionStorage.setItem(DISMISS_KEY, state.key);
          } catch {
            // ignore
          }
        }}
        className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
