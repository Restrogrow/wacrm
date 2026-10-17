'use client';

// ============================================================
// AlertChannelsSettings - Integrations -> Webhooks & alerts -> Team alerts
//
// Post a short message to Slack, Discord or Telegram when something
// important happens: a new conversation, an overdue reply, an ad lead, a
// payment, an order. The webhook URL / bot token is stored encrypted and
// is never shown again after saving.
// API: /api/integrations/alerts (see lib/alerts/server.ts).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, Loader2, Plus, Send, Trash2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { SettingsPanelHead } from './settings-panel-head';

type Kind = 'slack' | 'discord' | 'telegram';

interface Channel {
  id: string;
  kind: Kind;
  name: string;
  description: string;
  events: string[];
  enabled: boolean;
  last_status: 'ok' | 'failed' | null;
  last_error: string | null;
  last_sent_at: string | null;
}

interface EventInfo {
  id: string;
  label: string;
  description: string;
}

const KIND_LABEL: Record<Kind, string> = { slack: 'Slack', discord: 'Discord', telegram: 'Telegram' };

const HELP: Record<Kind, string> = {
  slack: 'In Slack: Apps → Incoming Webhooks (or create an app with Incoming Webhooks) → Add to a channel → copy the URL that starts with https://hooks.slack.com/services/…',
  discord: 'In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL (https://discord.com/api/webhooks/…).',
  telegram: 'In Telegram: talk to @BotFather → /newbot → copy the bot token. Add the bot to your group or channel, then enter the chat id (like -1001234567890) or @channelname.',
};

function fmt(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function EventPicker({
  events,
  value,
  onChange,
  disabled,
}: {
  events: EventInfo[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {events.map((e) => (
        <label key={e.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            disabled={disabled}
            checked={value.includes(e.id)}
            onChange={(ev) => onChange(ev.target.checked ? [...value, e.id] : value.filter((x) => x !== e.id))}
          />
          <span>
            {e.label}
            <span className="text-muted-foreground block text-xs">{e.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function AlertChannelsSettings() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [maxChannels, setMaxChannels] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('slack');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [chatId, setChatId] = useState('');
  const [picked, setPicked] = useState<string[]>(['new_conversation', 'order_placed']);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/alerts', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissing(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load alert channels');
        return;
      }
      setChannels(json.channels ?? []);
      setEvents(json.events ?? []);
      setMaxChannels(json.max_channels ?? 5);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setBusy('add');
    try {
      const res = await fetch('/api/integrations/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, target, chat_id: chatId, events: picked }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save the channel');
        return;
      }
      toast.success('Channel saved. Send a test to check it.');
      setName('');
      setTarget('');
      setChatId('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/integrations/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      setChannels((cs) => cs.map((c) => (c.id === id ? json.channel : c)));
    } finally {
      setBusy(null);
    }
  }

  async function test(id: string) {
    setBusy(`test-${id}`);
    try {
      const res = await fetch(`/api/integrations/alerts/${id}/test`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) toast.success('Test alert sent');
      else toast.error(json.error ?? 'Test failed');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: Channel) {
    if (!window.confirm(`Remove the ${KIND_LABEL[c.kind]} channel "${c.name}"?`)) return;
    setBusy(c.id);
    try {
      const res = await fetch(`/api/integrations/alerts/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not remove the channel');
        return;
      }
      await load();
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

  if (missing) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead icon={BellRing} title="Team alerts" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">{missing}</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={BellRing}
        title="Team alerts"
        description="Get a message in Slack, Discord or Telegram when a new customer writes, a reply is overdue, an ad lead arrives, a payment is received or an order is placed."
      />

      {canEditSettings && (
        <Card>
          <CardContent className="space-y-4 py-5">
            <h3 className="text-sm font-bold">Add a channel</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
                  {KIND_LABEL[k]}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{HELP[kind]}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="alert-name">Name (optional)</Label>
                <Input id="alert-name" value={name} maxLength={80} placeholder={`${KIND_LABEL[kind]} – sales team`} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-target">{kind === 'telegram' ? 'Bot token' : 'Webhook URL'}</Label>
                <Input
                  id="alert-target"
                  type="password"
                  autoComplete="off"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={kind === 'telegram' ? '123456789:AA…' : 'https://…'}
                />
              </div>
              {kind === 'telegram' && (
                <div className="space-y-1.5">
                  <Label htmlFor="alert-chat">Chat id or @channel</Label>
                  <Input id="alert-chat" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-1001234567890" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Alert me about</Label>
              <EventPicker events={events} value={picked} onChange={setPicked} />
            </div>
            <Button type="button" onClick={add} disabled={busy === 'add' || !target.trim() || picked.length === 0 || channels.length >= maxChannels}>
              {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Save channel
            </Button>
            <p className="text-muted-foreground text-xs">
              The URL or token is stored encrypted and never shown again. Alerts contain a customer&apos;s name and phone number, so only add channels your team already uses.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {channels.length === 0 && <p className="text-muted-foreground text-sm">No alert channels yet.</p>}
        {channels.map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.name} <span className="text-muted-foreground text-xs font-normal">· {KIND_LABEL[c.kind]}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">{c.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      disabled={!canEditSettings || busy === c.id}
                      onChange={(e) => patch(c.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                  {canEditSettings && (
                    <>
                      <Button type="button" variant="outline" size="sm" disabled={busy === `test-${c.id}`} onClick={() => test(c.id)}>
                        {busy === `test-${c.id}` ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        Send test
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy === c.id} onClick={() => remove(c)}>
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <EventPicker
                events={events}
                value={c.events}
                disabled={!canEditSettings || busy === c.id}
                onChange={(next) => next.length > 0 && patch(c.id, { events: next })}
              />
              <p className="flex items-center gap-1.5 text-xs">
                {c.last_status === 'ok' && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                {c.last_status === 'failed' && <XCircle className="size-3.5 text-red-500" />}
                <span className={c.last_status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}>
                  {c.last_status === 'failed' ? `Last send failed: ${c.last_error ?? 'unknown error'}` : `Last sent ${fmt(c.last_sent_at)}`}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
