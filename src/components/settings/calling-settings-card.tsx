'use client';

// Settings → WhatsApp → "WhatsApp calling": turn voice calling on or off
// for the business number (Meta Calling API). Admins can change it.
// API: /api/whatsapp/calling-settings.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';

interface CallingSettings {
  status: 'ENABLED' | 'DISABLED';
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
        toast.error(body?.error ?? 'Could not change calling.');
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
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Phone className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">WhatsApp calling</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Let customers call your WhatsApp number and answer in the browser, and call them from the inbox.
                Calls ring for every agent; the first to answer takes it. Customer calls are free; calls you make
                are billed by Meta per minute.
              </p>
            </div>
          </div>
          {settings ? (
            <Switch
              checked={on}
              disabled={!canEditSettings || saving}
              onCheckedChange={(v) => void toggle(v)}
              aria-label="WhatsApp calling"
            />
          ) : !error ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Needs a WhatsApp messaging limit of at least 2,000 customers a day.</li>
          <li>To call a customer, they must allow it first — the Call button sends them a request.</li>
          <li>Allow microphone access in your browser the first time you answer or call.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
