'use client';

// ============================================================
// DailySummarySettings — Settings → Daily summary
//
// A daily email with the account's WhatsApp numbers (messages, new
// chats and contacts, chats waiting, broadcasts, deals, opt-outs).
// The owner picks on/off, the hour (India time) and up to 5
// recipients; "Send a test now" emails it straight away.
// API: /api/account/daily-summary (lib/summary/daily.ts).
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mail, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { SUMMARY_ROWS } from '@/lib/summary/report';
import { SettingsPanelHead } from './settings-panel-head';

interface SummarySettings {
  available: boolean;
  email_configured: boolean;
  enabled?: boolean;
  hour?: number;
  emails?: string[];
  last_sent_on?: string | null;
  owner_email?: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}${
    h < 12 ? " — yesterday's numbers" : ' — today so far'
  }`,
}));

export function DailySummarySettings() {
  const { canEditSettings } = useAuth();
  const readOnly = !canEditSettings;
  const [settings, setSettings] = useState<SummarySettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState('9');
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/account/daily-summary', {
        cache: 'no-store',
      });
      const json = (
        res.ok
          ? await res.json()
          : { available: false, email_configured: false }
      ) as SummarySettings;
      if (cancelled) return;
      setSettings(json);
      setEnabled(!!json.enabled);
      setHour(String(json.hour ?? 9));
      setEmails((json.emails ?? []).join(', '));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy('save');
    try {
      const res = await fetch('/api/account/daily-summary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          hour: Number(hour),
          emails: emails.split(/[\s,;]+/).filter(Boolean),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Could not save');
      else toast.success(enabled ? 'Daily summary is on' : 'Saved');
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy('test');
    try {
      const res = await fetch('/api/account/daily-summary', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Could not send');
      else toast.success(`Sent to ${(json.to as string[]).join(', ')}`);
    } finally {
      setBusy(null);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (!settings.available) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead title="Daily summary" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            The daily summary isn&apos;t set up yet. Run
            supabase/migrations/044_daily_summary.sql in the Supabase SQL
            Editor.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Daily summary"
        description="A short email every day with how WhatsApp went for your business. Pick when it arrives and who gets it."
      />

      {!settings.email_configured && (
        <Card className="border-amber-500/40">
          <CardContent className="text-muted-foreground py-4 text-sm">
            Email sending isn&apos;t set up on the server yet, so summaries
            won&apos;t go out. (Repeat Grow admins: add the SMTP_* settings.)
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-medium">
                Send me a daily summary
              </p>
              <p className="text-muted-foreground text-xs">
                {settings.last_sent_on
                  ? `Last sent ${new Date(`${settings.last_sent_on}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}.`
                  : 'Off by default.'}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={readOnly}
              aria-label="Send a daily summary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">
                Time (India time)
              </Label>
              <Select
                value={hour}
                onValueChange={(v) => setHour(v ?? '9')}
                disabled={readOnly}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="summary-emails"
                className="text-muted-foreground text-xs"
              >
                Send to (comma-separated, up to 5)
              </Label>
              <Input
                id="summary-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={settings.owner_email ?? 'you@example.com'}
                disabled={readOnly}
              />
              <p className="text-muted-foreground text-xs">
                Leave empty to send it to the account owner
                {settings.owner_email ? ` (${settings.owner_email})` : ''}.
              </p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
              <Mail className="size-3.5" />
              What&apos;s in it
            </p>
            <p className="text-muted-foreground text-xs">
              {SUMMARY_ROWS.map((r) => r.label).join(' · ')}
            </p>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={sendTest}
                disabled={busy !== null || !settings.email_configured}
              >
                {busy === 'test' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send a test now
              </Button>
              <Button onClick={save} disabled={busy !== null}>
                {busy === 'save' && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
