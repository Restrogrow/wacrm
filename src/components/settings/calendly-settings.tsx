'use client';

// ============================================================
// CalendlySettings — Settings → Calendly
//
// Connect Calendly with a personal access token and choose which
// approved WhatsApp template to send when someone books, reschedules,
// cancels or no-shows — plus 24 h / 1 h reminders before the meeting.
// Any member can view; admin+ can connect, edit and send tests.
// API: /api/integrations/calendly (see lib/calendly/process.ts).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Bell,
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Clock,
  Link2,
  Loader2,
  MessageSquare,
  Save,
  Unplug,
  UserX,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import {
  CALENDLY_EVENTS,
  CALENDLY_EVENT_META,
  CALENDLY_VARIABLES,
  type CalendlyEvent,
} from '@/lib/calendly/events';
import {
  IntegrationActivity,
  MessageRulesEditor,
  fmtActivityTime,
  useApprovedTemplates,
  type MessageRule,
} from './integration-message-rules';
import { SettingsPanelHead } from './settings-panel-head';

interface ConnectionInfo {
  user_name: string | null;
  user_email: string | null;
  scheduling_url: string | null;
  default_country_code: string;
  phone_question: string | null;
  last_event_at: string | null;
  created_at: string;
}

interface ActivityRow {
  id: string;
  topic: string;
  event: CalendlyEvent | null;
  invitee_name: string | null;
  phone: string | null;
  status: 'received' | 'sent' | 'skipped' | 'failed';
  detail: string | null;
  created_at: string;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  booking_confirmed: CalendarCheck,
  booking_rescheduled: CalendarClock,
  reminder_24h: Bell,
  reminder_1h: BellRing,
  booking_cancelled: CalendarX,
  no_show: UserX,
};

const emptyRule = (): MessageRule => ({
  enabled: false,
  template_name: null,
  template_language: null,
  body_variables: [],
});

export function CalendlySettings() {
  const { canEditSettings } = useAuth();
  const readOnly = !canEditSettings;
  const templates = useApprovedTemplates();

  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [rules, setRules] = useState<Record<CalendlyEvent, MessageRule>>(
    () =>
      Object.fromEntries(
        CALENDLY_EVENTS.map((e) => [e, emptyRule()])
      ) as Record<CalendlyEvent, MessageRule>
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const [tokenInput, setTokenInput] = useState('');
  const [countryCode, setCountryCode] = useState('91');
  const [phoneQuestion, setPhoneQuestion] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/calendly', {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissingTable(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load Calendly settings');
        return;
      }
      setConnection(json.connection);
      setCountryCode(json.connection?.default_country_code ?? '91');
      setPhoneQuestion(json.connection?.phone_question ?? '');
      setActivity(json.events ?? []);
      setRules((prev) => {
        const next = { ...prev };
        for (const r of (json.rules ?? []) as (MessageRule & {
          event: CalendlyEvent;
        })[]) {
          if (r.event in next) next[r.event] = { ...emptyRule(), ...r };
        }
        return next;
      });
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRule = (event: CalendlyEvent, patch: Partial<MessageRule>) => {
    setRules((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }));
    setDirty(true);
  };

  async function connect() {
    setBusy('connect');
    try {
      const res = await fetch('/api/integrations/calendly/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not connect Calendly');
        return;
      }
      toast.success(
        `Calendly connected${json.user_name ? ` for ${json.user_name}` : ''}`
      );
      setTokenInput('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const res = await fetch('/api/integrations/calendly', {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Could not disconnect');
        return;
      }
      toast.success('Calendly disconnected');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    setBusy('settings');
    try {
      const res = await fetch('/api/integrations/calendly', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_country_code: countryCode,
          phone_question: phoneQuestion,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Could not save');
      else toast.success('Saved');
    } finally {
      setBusy(null);
    }
  }

  async function saveRules() {
    setBusy('rules');
    try {
      const res = await fetch('/api/integrations/calendly/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: CALENDLY_EVENTS.map((event) => ({ event, ...rules[event] })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      toast.success('Messages saved');
      setDirty(false);
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(event: CalendlyEvent) {
    if (dirty) {
      toast.error('Save your changes first');
      return;
    }
    if (!testPhone.trim()) {
      toast.error('Enter your WhatsApp number in "Send tests to" first');
      return;
    }
    setBusy(`test:${event}`);
    try {
      const res = await fetch('/api/integrations/calendly/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, phone: testPhone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Test failed');
      else toast.success('Test message sent — check WhatsApp');
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (missingTable) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead icon={CalendarCheck} title="Calendly" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            {missingTable}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={CalendarCheck}
        title="Calendly"
        description="Confirm bookings on WhatsApp, remind people 24 hours and 1 hour before the meeting, and follow up on cancellations and no-shows. Messages appear in your inbox like any other chat."
        action={
          connection ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-semibold text-primary">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-sm font-semibold text-muted-foreground">
              <span className="size-2 rounded-full bg-muted-foreground/50" />
              Not connected
            </span>
          )
        }
      />

      {/* ---------------- Stat tiles ---------------- */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Calendar', value: connection ? (connection.user_name || connection.user_email || 'Calendly') : 'Not connected', icon: CalendarCheck, tone: 'bg-primary text-primary-foreground shadow-primary/30' },
          { label: 'Messages sent', value: String(activity.filter((r) => r.status === 'sent').length), icon: MessageSquare, tone: 'bg-sky-500 text-white shadow-sky-500/30' },
          { label: 'Active automations', value: `${Object.values(rules).filter((r) => r.enabled).length} / ${CALENDLY_EVENTS.length}`, icon: Zap, tone: 'bg-amber-500 text-white shadow-amber-500/30' },
          { label: 'Last booking event', value: connection ? fmtActivityTime(connection.last_event_at) : '—', icon: Clock, tone: 'bg-violet-500 text-white shadow-violet-500/30' },
        ].map((st) => (
          <div key={st.label} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <span className={`flex size-11 items-center justify-center rounded-2xl shadow-lg ${st.tone}`}>
              <st.icon className="size-5" />
            </span>
            <p className="mt-4 truncate text-xl leading-none font-bold tracking-tight text-foreground tabular-nums">{st.value}</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{st.label}</p>
          </div>
        ))}
      </div>

      {/* ---------------- Connection ---------------- */}
      {connection ? (
        <Card className="overflow-hidden">
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-primary-soft via-card to-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                  <CalendarCheck className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate font-medium">
                      {connection.user_name ||
                        connection.user_email ||
                        'Calendly'}
                    </span>
                    <Badge className="border-primary/40 bg-primary/10 text-primary text-[10px] tracking-wide uppercase">
                      Connected
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {connection.scheduling_url ?? connection.user_email} · last
                    booking event {fmtActivityTime(connection.last_event_at)}
                  </p>
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disconnect}
                  disabled={busy === 'disconnect'}
                  className="self-start border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                >
                  {busy === 'disconnect' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Unplug className="size-4" />
                  )}
                  Disconnect
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="calendly-cc"
                  className="text-muted-foreground text-xs"
                >
                  Default country code
                </Label>
                <Input
                  id="calendly-cc"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={readOnly}
                  className="w-24"
                  placeholder="91"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="calendly-question"
                  className="text-muted-foreground text-xs"
                >
                  Booking question with the phone number (optional)
                </Label>
                <Input
                  id="calendly-question"
                  value={phoneQuestion}
                  onChange={(e) => setPhoneQuestion(e.target.value)}
                  disabled={readOnly}
                  placeholder="e.g. WhatsApp number — leave blank to detect it"
                />
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveSettings}
                  disabled={busy === 'settings'}
                >
                  Save
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Calendly doesn&apos;t ask for a phone number by default. In each
              event type, add a booking question of type <b>Phone number</b>{' '}
              (e.g. &ldquo;WhatsApp number&rdquo;) or turn on text reminders —
              otherwise there&apos;s no number to message.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="ring-2 ring-primary/30">
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <Link2 className="size-6" />
              </span>
              <div>
                <p className="text-foreground text-lg font-bold tracking-tight">Connect Calendly</p>
                <p className="text-muted-foreground text-xs">Three quick steps &mdash; we set up the booking webhooks for you.</p>
              </div>
            </div>
            <ol className="grid gap-3 md:grid-cols-3">
              {[
                <>In Calendly, open <b>Integrations &rarr; API &amp; Webhooks</b>.</>,
                <>Under <b>Personal access tokens</b>, click <b>Generate new token</b>, name it &ldquo;Repeat Grow&rdquo; and copy it.</>,
                <>Paste it below and press <b>Connect Calendly</b>.</>,
              ].map((text, i) => (
                <li key={i} className="flex gap-3 rounded-2xl border border-border bg-card-2 p-4">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{i + 1}</span>
                  <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
                </li>
              ))}
            </ol>
            <p className="rounded-2xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              Needs a paid Calendly plan (Calendly only allows webhooks on paid plans).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Calendly personal access token"
                className="font-mono text-xs"
                disabled={readOnly}
              />
              <Button
                onClick={connect}
                disabled={readOnly || !tokenInput || busy === 'connect'}
                className="rounded-xl shadow-md shadow-primary/25"
              >
                {busy === 'connect' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CalendarCheck className="size-4" />
                )}
                Connect Calendly
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------- Messages ---------------- */}
      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <MessageSquare className="size-4" />
              </span>
              Automatic messages
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Pick an approved template for each event and choose what fills
              each {'{{1}}'}, {'{{2}}'}… Use the Utility category —
              confirmations and reminders are service messages.
            </p>
          </div>
          {connection && !readOnly && (
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="calendly-test-phone"
                className="text-muted-foreground text-xs"
              >
                Send tests to
              </Label>
              <Input
                id="calendly-test-phone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-44"
              />
            </div>
          )}
        </div>

        <MessageRulesEditor
          events={CALENDLY_EVENTS}
          meta={CALENDLY_EVENT_META}
          variables={CALENDLY_VARIABLES}
          rules={rules}
          templates={templates}
          readOnly={readOnly}
          canTest={!!connection && !readOnly}
          icons={EVENT_ICONS}
          testingEvent={
            busy?.startsWith('test:') ? (busy.slice(5) as CalendlyEvent) : null
          }
          onChange={updateRule}
          onTest={sendTest}
        />

        {!readOnly && (
          <div className="mt-4 flex justify-end">
            <Button onClick={saveRules} disabled={!dirty || busy === 'rules'} className="rounded-xl shadow-md shadow-primary/25">
              {busy === 'rules' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save messages
            </Button>
          </div>
        )}
      </div>

      {/* ---------------- Activity ---------------- */}
      <IntegrationActivity
        items={activity.map((row) => ({
          id: row.id,
          status: row.status,
          label: `${row.event ? (CALENDLY_EVENT_META[row.event]?.label ?? row.event) : row.topic}${
            row.invitee_name ? ` · ${row.invitee_name}` : ''
          }${row.topic === 'test' ? ' · test' : ''}`,
          phone: row.phone,
          detail: row.detail,
          created_at: row.created_at,
        }))}
      />
    </section>
  );
}
