'use client';

// Floating call card (bottom-right): incoming call with Answer / Decline,
// or the call in progress with a timer, mute and hang up. On AI calls it
// shows what the AI is doing, the last lines said, and Take over.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Hand, Loader2, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCalls, type AiCallState } from './call-provider';

const AI_STATE_TEXT: Record<AiCallState['state'], string> = {
  connecting: 'AI is getting ready…',
  listening: 'AI is listening',
  speaking: 'AI is speaking',
};

function AiAnswerCountdown({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.ceil((at - now) / 1000);
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-primary">
      <Bot className="size-3" />
      {left > 0 ? `AI answers in ${left}s unless you pick up` : 'AI is answering…'}
    </p>
  );
}

function AiPanel({ ai, onTakeOver }: { ai: AiCallState; onTakeOver: () => void }) {
  if (ai.mode === 'human') {
    return <p className="mt-3 text-xs text-muted-foreground">You took over from the AI. Your mic is on the call.</p>;
  }
  return (
    <div
      className={cn(
        'mt-3 space-y-2 rounded-xl border p-3',
        ai.handoff || ai.mode === 'stopped' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-muted/50',
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Bot className="size-3.5" />
        {ai.mode === 'stopped'
          ? 'The AI stopped. Take over or hang up.'
          : ai.handoff
            ? `Take over: ${ai.handoff}`
            : AI_STATE_TEXT[ai.state]}
        {ai.mode === 'ai' && ai.state === 'speaking' && !ai.handoff && (
          <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
        )}
      </p>
      {ai.lines.length > 0 && (
        <ul className="max-h-28 space-y-1 overflow-y-auto text-xs" aria-live="polite">
          {ai.lines.map((line, i) => (
            <li key={i} className={line.who === 'ai' ? 'text-muted-foreground' : 'text-foreground'}>
              <span className="font-medium">{line.who === 'ai' ? 'AI: ' : 'Customer: '}</span>
              {line.text}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onTakeOver}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
      >
        <Hand className="size-3.5" />
        Take over the call
      </button>
    </div>
  );
}

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
  const { incoming, active, muted, answer, decline, hangup, toggleMute, aiNotes, startAiNotes, takeOver, aiAnswerAt } =
    useCalls();

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
            <p className="text-xs text-muted-foreground">
              {active.ai ? 'AI call' : 'WhatsApp voice call'} · {status}
            </p>
            {aiNotes === 'recording' && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                <span className="size-1.5 animate-pulse rounded-full bg-red-600" aria-hidden />
                Recording for AI notes · tell the customer
              </p>
            )}
          </div>
        </div>
        {active.ai && active.phase === 'connected' && (
          <AiPanel ai={active.ai} onTakeOver={() => void takeOver()} />
        )}
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
            {active.phase === 'connected' && (
              <button
                type="button"
                onClick={() => void startAiNotes()}
                disabled={aiNotes !== 'off'}
                aria-pressed={aiNotes === 'recording'}
                aria-label={aiNotes === 'recording' ? 'AI notes are recording' : 'Start AI notes for this call'}
                title={
                  aiNotes === 'recording'
                    ? 'Recording. Notes are written when the call ends.'
                    : 'AI notes: record this call and get a summary, to-dos and follow-up when it ends'
                }
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border transition-colors disabled:cursor-default',
                  aiNotes === 'recording'
                    ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400'
                    : 'border-border bg-muted text-foreground hover:bg-muted/70',
                )}
              >
                {aiNotes === 'saving' ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
              </button>
            )}
            {(!active.ai || active.ai.mode === 'human') && (
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
            )}
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
          {aiAnswerAt && <AiAnswerCountdown at={aiAnswerAt} />}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void decline()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          <PhoneOff className="size-4" />
          Decline
        </button>
        <button
          type="button"
          onClick={() => void answer()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
        >
          <Phone className="size-4" />
          Answer
        </button>
      </div>
    </div>
  );
}
