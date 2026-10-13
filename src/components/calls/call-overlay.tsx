'use client';

// Floating call card (bottom-right): incoming call with Answer / Decline,
// or the call in progress with a timer, mute and hang up.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, MicOff, Phone, PhoneIncoming, PhoneOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCalls } from './call-provider';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{formatDuration(Math.max(0, Math.floor((now - since) / 1000)))}</span>;
}

function Avatar({ label, pulse }: { label: string; pulse?: boolean }) {
  return (
    <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white">
      {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40" aria-hidden />}
      <span className="relative">{label.replace(/^\+/, '').charAt(0).toUpperCase() || '?'}</span>
    </div>
  );
}

export function CallOverlay() {
  const { incoming, active, muted, answer, decline, hangup, toggleMute } = useCalls();

  if (!incoming && !active) return null;

  if (active) {
    const status =
      active.phase === 'connected' && active.connectedAt ? (
        <Elapsed since={active.connectedAt} />
      ) : active.phase === 'connecting' ? (
        'Connecting…'
      ) : (
        'Calling…'
      );
    return (
      <div
        role="dialog"
        aria-label="WhatsApp call"
        className="fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <Avatar label={active.label} pulse={active.phase !== 'connected'} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{active.label}</p>
            <p className="text-xs text-muted-foreground">WhatsApp voice call · {status}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {active.conversationId ? (
            <Link
              href={`/inbox?c=${active.conversationId}`}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Open chat
            </Link>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className={cn(
                'flex size-11 items-center justify-center rounded-full border border-border transition-colors',
                muted ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-muted/70',
              )}
            >
              {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            <button
              type="button"
              onClick={() => void hangup()}
              aria-label="Hang up"
              className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
            >
              <PhoneOff className="size-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const call = incoming!;
  const label = call.customer_name || (call.customer_number ? `+${call.customer_number}` : 'WhatsApp caller');
  return (
    <div
      role="alertdialog"
      aria-label="Incoming WhatsApp call"
      className="fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-emerald-500/40 bg-card p-4 shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <Avatar label={label} pulse />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <PhoneIncoming className="size-3.5" />
            Incoming WhatsApp call
          </p>
          <p className="truncate font-semibold text-foreground">{label}</p>
          {call.customer_name && call.customer_number && (
            <p className="text-xs text-muted-foreground">+{call.customer_number}</p>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void decline()}
          className="flex items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          <PhoneOff className="size-4" />
          Decline
        </button>
        <button
          type="button"
          onClick={() => void answer()}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
        >
          <Phone className="size-4" />
          Answer
        </button>
      </div>
    </div>
  );
}
