'use client';

// Settings → WhatsApp → "Number health": quality rating, messaging
// limit, display name, send status and calling, each with a plain
// explanation. API: /api/whatsapp/number-health.

import { useEffect, useState, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Activity, Loader2, RefreshCw } from 'lucide-react';

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
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <p className="w-40 shrink-0 text-sm text-muted-foreground">{label}</p>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className={cn('size-2 rounded-full', TONE[tone])} aria-hidden />
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </div>
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
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">Number health</h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">Connect WhatsApp above to see your number&apos;s health.</p>
        ) : (
          <>
            {data.reasons && data.reasons.length > 0 && (
              <ul
                className={cn(
                  'space-y-1 rounded-lg border p-3 text-sm text-foreground',
                  data.level === 'critical' ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5',
                )}
              >
                {data.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {h.check_error && (
              <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                Couldn&apos;t check with WhatsApp: {h.check_error}
              </p>
            )}
            <div>
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
                help={
                  h.health_errors?.length
                    ? h.health_errors.map((e) => [e.error_description, e.possible_solution].filter(Boolean).join(' — ')).join(' ')
                    : 'Whether Meta currently lets this number send messages.'
                }
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
