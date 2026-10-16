'use client';

// Settings → WhatsApp → "Number health": quality rating, messaging
// limit, display name, send status and calling, each with a plain
// explanation. API: /api/whatsapp/number-health.

import { IconChip } from '@/components/icon-chip';
import { useEffect, useState, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Activity, Loader2, PlugZap, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Health {
  display_phone: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  messaging_limit: string | null;
  name_status: string | null;
  number_status: string | null;
  can_send: string | null;
  health_errors: { error_description?: string; possible_solution?: string }[] | null;
  calling_status: string | null;
  check_error: string | null;
  checked_at: string | null;
}

interface HealthResponse {
  available: boolean;
  health: Health | null;
  level?: 'ok' | 'warning' | 'critical' | 'unknown';
  reasons?: string[];
}

type Tone = 'good' | 'warn' | 'bad' | 'muted';

const TONE: Record<Tone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  muted: 'bg-muted-foreground/40',
};

const TONE_CHIP: Record<Tone, string> = {
  good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  bad: 'bg-red-500/10 text-red-700 dark:text-red-300',
  muted: 'bg-muted text-muted-foreground',
};

function limitText(limit: string | null): string {
  if (!limit) return 'Unknown';
  const v = limit.toUpperCase().replace(/^TIER_/, '');
  if (v === 'UNLIMITED') return 'Unlimited';
  const m = v.match(/^(\d+)(K)?$/);
  if (!m) return limit;
  return `${(Number(m[1]) * (m[2] ? 1000 : 1)).toLocaleString('en-IN')} customers / day`;
}

function limitNumber(limit: string | null): number {
  const v = (limit ?? '').toUpperCase().replace(/^TIER_/, '');
  if (v === 'UNLIMITED') return Infinity;
  const m = v.match(/^(\d+)(K)?$/);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : 0;
}

function Row({ label, tone, value, help }: { label: string; tone: Tone; value: string; help: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card-2 p-4">
      <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-2 rounded-full px-3 py-1 text-sm font-bold',
          TONE_CHIP[tone],
        )}
      >
        <span className={cn('size-2 shrink-0 rounded-full', TONE[tone])} aria-hidden />
        <span className="truncate">{value}</span>
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{help}</p>
    </div>
  );
}

export function NumberHealthCard() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whatsapp/number-health')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: HealthResponse | null) => !cancelled && setData(body ?? { available: true, health: null }))
      .catch(() => !cancelled && setData({ available: true, health: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await fetch('/api/whatsapp/number-health', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Try again later.');
        return;
      }
      setData(body);
      toast.success('Checked with WhatsApp.');
    } finally {
      setChecking(false);
    }
  }

  const h = data?.health;
  const quality = (h?.quality_rating ?? '').toUpperCase();
  const send = (h?.can_send ?? '').toUpperCase();
  const name = (h?.name_status ?? '').toUpperCase();
  const limit = limitNumber(h?.messaging_limit ?? null);

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Activity className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold tracking-tight text-foreground">Number health</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                How WhatsApp rates your number. Checked every day; the owner is emailed if it needs attention.
                {h?.checked_at && <> Last checked {formatDistanceToNow(new Date(h.checked_at), { addSuffix: true })}.</>}
              </p>
            </div>
          </div>
          {data?.available !== false && (
            <Button variant="outline" size="sm" onClick={checkNow} disabled={checking || !data}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Check now
            </Button>
          )}
        </div>

        {!data ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.available === false ? (
          <p className="text-sm text-muted-foreground">Run migration 049_whatsapp_number_health.sql to see number health.</p>
        ) : !h ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-primary-soft-2 bg-primary-soft/40 px-4 py-10 text-center">
            <IconChip icon={PlugZap} className="size-14 rounded-3xl" />
            <p className="text-base font-bold text-foreground">No number connected yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Connect your WhatsApp Business number above and we&apos;ll show its quality rating, messaging limit and
              status here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl bg-card"
              onClick={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Go to connection
            </Button>
          </div>
        ) : (
          <>
            {data.reasons && data.reasons.length > 0 && (
              <ul
                className={cn(
                  'space-y-1 rounded-2xl border p-3 text-sm text-foreground',
                  data.level === 'critical' ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5',
                )}
              >
                {data.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {h.check_error && (
              <p className="rounded-2xl border border-border p-3 text-sm text-muted-foreground">
                Couldn&apos;t check with WhatsApp: {h.check_error}
              </p>
            )}
            <div className="grid gap-3 2xl:grid-cols-2">
              <Row
                label="Quality rating"
                tone={quality === 'GREEN' ? 'good' : quality === 'YELLOW' ? 'warn' : quality === 'RED' ? 'bad' : 'muted'}
                value={quality === 'GREEN' ? 'High' : quality === 'YELLOW' ? 'Medium' : quality === 'RED' ? 'Low' : 'Not rated yet'}
                help="Based on how customers react to your messages in the last 7 days. Blocks and reports lower it; keep messages relevant and only send to people who opted in."
              />
              <Row
                label="Messaging limit"
                tone={limit >= 2000 ? 'good' : limit > 0 ? 'warn' : 'muted'}
                value={limitText(h.messaging_limit)}
                help={
                  limit >= 2000
                    ? 'How many different customers you can start conversations with in 24 hours. Meta raises it as you message more customers with good quality.'
                    : 'How many different customers you can start conversations with in 24 hours. Meta raises it automatically as you message more customers with good quality — calling needs at least 2,000.'
                }
              />
              <Row
                label="Can send messages"
                tone={send === 'AVAILABLE' ? 'good' : send === 'LIMITED' ? 'warn' : send === 'BLOCKED' ? 'bad' : 'muted'}
                value={send === 'AVAILABLE' ? 'Yes' : send === 'LIMITED' ? 'Limited' : send === 'BLOCKED' ? 'Blocked' : 'Unknown'}
                help={(() => {
                  // SIP calling warnings don't apply: calls run over WebRTC.
                  const errs = (h.health_errors ?? []).filter((e) => !/\bSIP\b/.test(e.error_description ?? ''));
                  return errs.length
                    ? errs.map((e) => [e.error_description, e.possible_solution].filter(Boolean).join(' — ')).join(' ')
                    : 'Whether Meta currently lets this number send messages.';
                })()}
              />
              <Row
                label="Display name"
                tone={name === 'APPROVED' || name === 'AVAILABLE_WITHOUT_REVIEW' ? 'good' : name === 'PENDING_REVIEW' ? 'warn' : name ? 'bad' : 'muted'}
                value={
                  h.verified_name
                    ? `${h.verified_name}${name ? ` · ${name.toLowerCase().replace(/_/g, ' ')}` : ''}`
                    : name.toLowerCase().replace(/_/g, ' ') || 'Unknown'
                }
                help="The business name customers see. Change it in WhatsApp Manager → Phone numbers; Meta reviews each change."
              />
              <Row
                label="WhatsApp calling"
                tone={h.calling_status === 'ENABLED' ? 'good' : h.calling_status === 'NOT_ALLOWED' ? 'warn' : 'muted'}
                value={
                  h.calling_status === 'ENABLED'
                    ? 'On'
                    : h.calling_status === 'NOT_ALLOWED'
                      ? 'Not allowed yet'
                      : h.calling_status === 'DISABLED'
                        ? 'Off'
                        : 'Unknown'
                }
                help={
                  h.calling_status === 'NOT_ALLOWED'
                    ? 'Meta hasn’t allowed calling on this number yet — it needs a 2,000+ messaging limit and a Cloud API-only number.'
                    : 'Turn calling on or off below.'
                }
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
