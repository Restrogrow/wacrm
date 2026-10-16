'use client';

// Settings → WhatsApp → "WhatsApp calling": turn voice calling on or off
// for the business number (Meta Calling API). Admins can change it.
// API: /api/whatsapp/calling-settings.

import { IconChip } from '@/components/icon-chip';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Gauge, Loader2, Mic, Phone, PhoneIncoming, PlugZap } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';

interface CallingSettings {
  status: 'ENABLED' | 'DISABLED';
  /** Set when Meta hasn't allowed calling on this number yet. */
  notice?: string;
}

export function CallingSettingsCard() {
  const { canEditSettings } = useAuth();
  const [settings, setSettings] = useState<CallingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whatsapp/calling-settings')
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok) setSettings(body);
        else setError(body?.error ?? 'Could not load calling settings.');
      })
      .catch(() => !cancelled && setError('Could not load calling settings.'));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/calling-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const message = body?.error ?? 'Could not change calling.';
        // Keep Meta's reason on the card, not just in a toast.
        if (body?.code === 'not_allowed') setSettings({ status: 'DISABLED', notice: message });
        else toast.error(message);
        return;
      }
      setSettings(body);
      setError(null);
      toast.success(enabled ? 'WhatsApp calling is on.' : 'WhatsApp calling is off.');
    } finally {
      setSaving(false);
    }
  }

  const on = settings?.status === 'ENABLED';

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Phone className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-foreground">WhatsApp calling</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Let customers call your WhatsApp number and answer in the browser, and call them from the inbox.
              Calls ring for every agent; the first to answer takes it. Customer calls are free; calls you make
              are billed by Meta per minute.
            </p>
          </div>
        </div>

        {/* On / off */}
        <div
          className={cn(
            'flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors',
            on ? 'border-primary-soft-2 bg-primary-soft' : 'border-border bg-card-2',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-xl',
                on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <PhoneIncoming className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Calling is {on ? 'on' : 'off'}</p>
              <p className="text-xs text-muted-foreground">
                {on ? 'Customers can call and agents can answer.' : 'Turn on to allow voice calls.'}
              </p>
            </div>
          </div>
          {settings || error ? (
            <div className="flex shrink-0 items-center gap-2">
              {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={on}
                disabled={!canEditSettings || saving || (!settings && !!error)}
                onCheckedChange={(v) => void toggle(v)}
                aria-label="WhatsApp calling"
              />
            </div>
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {settings?.notice && (
          <p className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-foreground">
            {settings.notice}
          </p>
        )}
        {error && !settings && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-primary-soft-2 bg-primary-soft/40 p-4">
            <IconChip icon={PlugZap} className="size-10 shrink-0 rounded-xl" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
        {!canEditSettings && (
          <p className="text-xs text-muted-foreground">Only owners and admins can change this.</p>
        )}
        <div>
          <p className="mb-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Before you start</p>
          <ul className="space-y-2">
            {[
              { icon: Gauge, text: 'Needs a WhatsApp messaging limit of at least 2,000 customers a day.' },
              { icon: PhoneIncoming, text: 'To call a customer, they must allow it first — the Call button sends them a request.' },
              { icon: Mic, text: 'Allow microphone access in your browser the first time you answer or call.' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
