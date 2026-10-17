'use client';

// ============================================================
// WebhookIntegrationPanel - the Settings UI shared by the webhook-based
// integrations built on the WooCommerce pattern (Shiprocket, Cal.com).
//
// Connect (Repeat Grow generates the delivery URL and a secret/token the
// merchant pastes into the other product), choose which approved WhatsApp
// template to send for each event, send tests, and see recent activity.
// Any member can view; admin+ can connect, edit and send tests.
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Unplug,
  Webhook,
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
  IntegrationActivity,
  MessageRulesEditor,
  fmtActivityTime,
  useApprovedTemplates,
  type MessageRule,
  type VariableOption,
} from './integration-message-rules';
import { SettingsPanelHead } from './settings-panel-head';

export interface PanelConnection {
  default_country_code: string;
  status: 'active' | 'disconnected';
  last_event_at: string | null;
  created_at: string;
  webhook_url: string;
  [extra: string]: unknown;
}

interface ActivityRow {
  id: string;
  topic: string;
  event: string | null;
  order_number?: string | null;
  attendee_name?: string | null;
  phone: string | null;
  status: 'received' | 'sent' | 'skipped' | 'failed';
  detail: string | null;
  created_at: string;
}

export interface WebhookTrigger {
  name: string;
  code: string;
  drives: string;
}

export function CopyField({ value, secret = false }: { value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono text-xs">
        {shown ? value : '•'.repeat(24)}
      </code>
      {secret && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide' : 'Show'}
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

export interface WebhookIntegrationPanelProps<E extends string> {
  /** e.g. "/api/integrations/calcom" */
  apiBase: string;
  name: string;
  icon: LucideIcon;
  description: string;
  connectTitle: string;
  connectHelp: string;
  connectButton: string;
  /** Label for the secret ("Secret" / "Token"). */
  secretLabel: string;
  events: readonly E[];
  meta: Record<E, { label: string; description: string }>;
  variables: VariableOption[];
  eventIcons?: Partial<Record<E, LucideIcon>>;
  /** Numbered steps shown once connected. */
  steps: ReactNode;
  /** The triggers/topics the merchant ticks in the other product. */
  triggers?: WebhookTrigger[];
  /** Optional text input on the connect form (Cal.com host). */
  connectInput?: { label: string; placeholder: string; field: string; required?: boolean };
  /** Extra settings shown under the connection (needs the loaded connection). */
  renderExtra?: (args: {
    connection: PanelConnection;
    readOnly: boolean;
    reload: () => Promise<void>;
  }) => ReactNode;
  /** How to describe one activity row. */
  activityLabel: (row: ActivityRow) => string;
  /** Stat tile: what the first tile shows when connected. */
  connectedLabel: string;
}

export function WebhookIntegrationPanel<E extends string>(props: WebhookIntegrationPanelProps<E>) {
  const {
    apiBase,
    name,
    icon: Icon,
    events,
    meta,
    variables,
    eventIcons,
  } = props;
  const { canEditSettings } = useAuth();

  type Rule = MessageRule & { event: E };
  const emptyRule = useCallback(
    (event: E): Rule => ({
      event,
      enabled: false,
      template_name: null,
      template_language: null,
      body_variables: [],
    }),
    []
  );

  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState<string | null>(null);
  const [conn, setConn] = useState<PanelConnection | null>(null);
  const [rules, setRules] = useState<Record<E, Rule>>(
    () => Object.fromEntries(events.map((e) => [e, emptyRule(e)])) as Record<E, Rule>
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const templates = useApprovedTemplates();

  const [input, setInput] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState('91');
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiBase, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissingTable(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? `Could not load ${name} settings`);
        return;
      }
      setConn(json.connection);
      setCountryCode(json.connection?.default_country_code ?? '91');
      setActivity(json.events ?? []);
      setRules((prev) => {
        const next = { ...prev };
        for (const r of (json.rules ?? []) as Rule[]) {
          if (r.event in next) next[r.event] = { ...emptyRule(r.event), ...r };
        }
        return next;
      });
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, [apiBase, name, emptyRule]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = !canEditSettings;

  const updateRule = (event: E, patch: Partial<Rule>) => {
    setRules((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }));
    setDirty(true);
  };

  async function connect(rotate = false) {
    setBusy(rotate ? 'rotate' : 'connect');
    try {
      const field = props.connectInput?.field;
      const res = await fetch(`${apiBase}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(field ? { [field]: input || (conn?.[field] as string | undefined) } : {}),
          rotate_secret: rotate,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      setSecret(json.secret ?? null);
      toast.success(
        rotate
          ? `New ${props.secretLabel.toLowerCase()} generated. Update it in ${name} too.`
          : `Saved. Now add the webhook in ${name} (steps below).`
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revealSecret() {
    setBusy('secret');
    try {
      const res = await fetch(`${apiBase}/credentials`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? `Could not load the ${props.secretLabel.toLowerCase()}`);
        return;
      }
      setSecret(json.secret);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const res = await fetch(apiBase, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not disconnect');
        return;
      }
      setSecret(null);
      toast.success(`${name} disconnected`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveCountryCode() {
    setBusy('country');
    try {
      const res = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_country_code: countryCode }),
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
      const res = await fetch(`${apiBase}/rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: Object.values(rules) }),
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

  async function sendTest(event: E) {
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
      const res = await fetch(`${apiBase}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, phone: testPhone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Test failed');
      else toast.success('Test message sent. Check WhatsApp.');
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
        <SettingsPanelHead icon={Icon} title={name} />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">{missingTable}</CardContent>
        </Card>
      </section>
    );
  }

  const connected = conn && conn.status === 'active';

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Icon}
        title={name}
        description={props.description}
        action={
          connected ? (
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
          { label: 'Status', value: connected ? props.connectedLabel : 'Not connected', icon: Icon, tone: 'bg-primary text-primary-foreground shadow-primary/30' },
          { label: 'Messages sent', value: String(activity.filter((r) => r.status === 'sent').length), icon: MessageSquare, tone: 'bg-sky-500 text-white shadow-sky-500/30' },
          { label: 'Active automations', value: `${(Object.values(rules) as Rule[]).filter((r) => r.enabled).length} / ${events.length}`, icon: Zap, tone: 'bg-amber-500 text-white shadow-amber-500/30' },
          { label: 'Last event', value: connected ? fmtActivityTime(conn?.last_event_at ?? null) : '—', icon: Clock, tone: 'bg-violet-500 text-white shadow-violet-500/30' },
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
      {connected ? (
        <Card className="overflow-hidden">
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-primary-soft via-card to-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                  <Icon className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate font-medium">{props.connectedLabel}</span>
                    <Badge className="border-primary/40 bg-primary/10 text-primary text-[10px] tracking-wide uppercase">
                      Connected
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Webhook
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    last event {fmtActivityTime(conn.last_event_at)}
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
                  {busy === 'disconnect' ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                  Disconnect
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor={`${apiBase}-cc`} className="text-muted-foreground text-xs">
                Country code for numbers saved without one
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${apiBase}-cc`}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={readOnly}
                  className="w-24"
                  placeholder="91"
                />
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={saveCountryCode} disabled={busy === 'country'}>
                    Save
                  </Button>
                )}
              </div>
            </div>

            {props.renderExtra?.({ connection: conn, readOnly, reload: load })}

            <div className="border-border bg-muted/30 space-y-3 rounded-2xl border p-4">
              <p className="text-foreground text-sm font-medium">Set up the webhook in {name}</p>
              <div className="text-muted-foreground text-sm">{props.steps}</div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Webhook URL</Label>
                <CopyField value={conn.webhook_url} />
              </div>
              {!readOnly && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{props.secretLabel}</Label>
                  {secret ? (
                    <CopyField value={secret} secret />
                  ) : (
                    <Button variant="outline" size="sm" onClick={revealSecret} disabled={busy === 'secret'}>
                      {busy === 'secret' && <Loader2 className="size-4 animate-spin" />}
                      Show {props.secretLabel.toLowerCase()}
                    </Button>
                  )}
                </div>
              )}
              {props.triggers && props.triggers.length > 0 && (
                <ul className="divide-border divide-y text-sm">
                  {props.triggers.map((t) => (
                    <li key={t.code} className="flex flex-wrap justify-between gap-2 py-1.5">
                      <span className="text-foreground">
                        {t.name} <code className="text-xs">({t.code})</code>
                      </span>
                      <span className="text-muted-foreground text-xs">{t.drives}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground text-xs">
                    Think the {props.secretLabel.toLowerCase()} leaked? Generate a new one, then update it in {name}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => connect(true)}
                    disabled={busy === 'rotate'}
                  >
                    {busy === 'rotate' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Generate new {props.secretLabel.toLowerCase()}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="ring-2 ring-primary/30">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Webhook className="size-5" />
              </span>
              <div>
                <p className="text-foreground text-base font-bold tracking-tight">{props.connectTitle}</p>
                <p className="text-muted-foreground text-xs">{props.connectHelp}</p>
              </div>
            </div>
            {props.connectInput && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">{props.connectInput.label}</Label>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={props.connectInput.placeholder}
                  disabled={readOnly}
                />
              </div>
            )}
            <Button
              onClick={() => connect(false)}
              disabled={readOnly || busy === 'connect' || (!!props.connectInput?.required && !input)}
              className="w-full sm:w-auto"
            >
              {busy === 'connect' ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
              {props.connectButton}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------------- Messages ---------------- */}
      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
              <IconChip icon={MessageSquare} className="size-9 rounded-xl" />
              Automatic messages
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Pick an approved template for each event and choose what fills each {'{{1}}'}, {'{{2}}'}… Create
              templates in Templates (use the Utility category).
            </p>
          </div>
          {connected && !readOnly && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${apiBase}-test-phone`} className="text-muted-foreground text-xs">
                  Send tests to
                </Label>
                <Input
                  id={`${apiBase}-test-phone`}
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-44"
                />
              </div>
            </div>
          )}
        </div>

        <MessageRulesEditor
          events={events}
          meta={meta}
          variables={variables}
          rules={rules}
          templates={templates}
          readOnly={readOnly}
          canTest={!!connected && !readOnly}
          icons={eventIcons}
          testingEvent={busy?.startsWith('test:') ? (busy.slice(5) as E) : null}
          onChange={updateRule}
          onTest={sendTest}
        />

        {!readOnly && (
          <div className="mt-4 flex justify-end">
            <Button onClick={saveRules} disabled={!dirty || busy === 'rules'} className="rounded-xl shadow-md shadow-primary/25">
              {busy === 'rules' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
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
          label: props.activityLabel(row),
          phone: row.phone,
          detail: row.detail,
          created_at: row.created_at,
        }))}
      />
    </section>
  );
}
