'use client';

// ============================================================
// WooCommerceSettings - Integrations -> WooCommerce
//
// Connect a WooCommerce store with a webhook (Repeat Grow generates the
// URL and the signing secret; the merchant pastes both into WooCommerce)
// and choose which approved WhatsApp template to send for each order
// event, filling {{1}}, {{2}}, ... from order data.
// Any member can view; admin+ can connect, edit and send tests.
// API: /api/integrations/woocommerce (see lib/woocommerce/process.ts).
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  ShoppingCart,
  Unplug,
  Undo2,
  Webhook,
  XCircle,
  Zap,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import {
  WOO_EVENTS,
  WOO_EVENT_META,
  WOO_VARIABLES,
  type WooEvent,
  type WooVariable,
} from '@/lib/woocommerce/events';
import {
  IntegrationActivity,
  MessageRulesEditor,
  fmtActivityTime,
  useApprovedTemplates,
} from './integration-message-rules';
import { SettingsPanelHead } from './settings-panel-head';

interface StoreInfo {
  store_url: string;
  store_name: string | null;
  default_country_code: string;
  status: 'active' | 'disconnected';
  last_event_at: string | null;
  created_at: string;
  webhook_url: string;
}

interface Rule {
  event: WooEvent;
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: WooVariable[];
}

interface ActivityRow {
  id: string;
  topic: string;
  event: WooEvent | null;
  order_number: string | null;
  phone: string | null;
  status: 'received' | 'sent' | 'skipped' | 'failed';
  detail: string | null;
  created_at: string;
}

interface Topic {
  topic: string;
  adminName: string;
  drives: string;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  order_placed: ShoppingCart,
  cod_order_placed: CreditCard,
  order_completed: CheckCircle2,
  order_cancelled: XCircle,
  order_refunded: Undo2,
};

function emptyRule(event: WooEvent): Rule {
  return {
    event,
    enabled: false,
    template_name: null,
    template_language: null,
    body_variables: [],
  };
}

function CopyField({ value, secret = false }: { value: string; secret?: boolean }) {
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

export function WooCommerceSettings() {
  const { canEditSettings } = useAuth();

  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [rules, setRules] = useState<Record<WooEvent, Rule>>(
    () =>
      Object.fromEntries(
        WOO_EVENTS.map((e) => [e, emptyRule(e)])
      ) as Record<WooEvent, Rule>
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const templates = useApprovedTemplates();

  const [urlInput, setUrlInput] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState('91');
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/woocommerce', {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissingTable(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load WooCommerce settings');
        return;
      }
      setTopics(json.topics ?? []);
      setStore(json.store);
      setCountryCode(json.store?.default_country_code ?? '91');
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = !canEditSettings;

  const updateRule = (event: WooEvent, patch: Partial<Rule>) => {
    setRules((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }));
    setDirty(true);
  };

  async function connect(rotate = false) {
    setBusy(rotate ? 'rotate' : 'connect');
    try {
      const res = await fetch('/api/integrations/woocommerce/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_url: urlInput || store?.store_url,
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
          ? 'New secret generated. Update it in WooCommerce too.'
          : 'Saved. Now add the webhooks in WooCommerce (steps below).'
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revealSecret() {
    setBusy('secret');
    try {
      const res = await fetch('/api/integrations/woocommerce/credentials', {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load the secret');
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
      const res = await fetch('/api/integrations/woocommerce', {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Could not disconnect');
        return;
      }
      setSecret(null);
      toast.success('Store disconnected');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveCountryCode() {
    setBusy('country');
    try {
      const res = await fetch('/api/integrations/woocommerce', {
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
      const res = await fetch('/api/integrations/woocommerce/rules', {
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

  async function sendTest(event: WooEvent) {
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
      const res = await fetch('/api/integrations/woocommerce/test', {
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
        <SettingsPanelHead icon={ShoppingCart} title="WooCommerce" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            {missingTable}
          </CardContent>
        </Card>
      </section>
    );
  }

  const connected = store && store.status === 'active';

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={ShoppingCart}
        title="WooCommerce"
        description="Send WhatsApp messages automatically when customers place an order and when it is completed, cancelled or refunded. Messages appear in your inbox like any other chat."
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
          { label: 'Store', value: connected ? (store?.store_name || store?.store_url || '—') : 'Not connected', icon: ShoppingCart, tone: 'bg-primary text-primary-foreground shadow-primary/30' },
          { label: 'Messages sent', value: String(activity.filter((r) => r.status === 'sent').length), icon: MessageSquare, tone: 'bg-sky-500 text-white shadow-sky-500/30' },
          { label: 'Active automations', value: `${Object.values(rules).filter((r) => r.enabled).length} / ${WOO_EVENTS.length}`, icon: Zap, tone: 'bg-amber-500 text-white shadow-amber-500/30' },
          { label: 'Last event', value: connected ? fmtActivityTime(store?.last_event_at ?? null) : '—', icon: Clock, tone: 'bg-violet-500 text-white shadow-violet-500/30' },
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
                  <ShoppingCart className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate font-medium">
                      {store.store_name || store.store_url}
                    </span>
                    <Badge className="border-primary/40 bg-primary/10 text-primary text-[10px] tracking-wide uppercase">
                      Connected
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Webhooks
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {store.store_url} · last event{' '}
                    {fmtActivityTime(store.last_event_at)}
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

            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label
                htmlFor="woo-cc"
                className="text-muted-foreground text-xs"
              >
                Country code for numbers saved without one
              </Label>
              <div className="flex gap-2">
                <Input
                  id="woo-cc"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={readOnly}
                  className="w-24"
                  placeholder="91"
                />
                {!readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveCountryCode}
                    disabled={busy === 'country'}
                  >
                    Save
                  </Button>
                )}
              </div>
            </div>

            <div className="border-border bg-muted/30 space-y-3 rounded-2xl border p-4">
              <p className="text-foreground text-sm font-medium">
                Webhooks to add in WooCommerce
              </p>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                <li>
                  In WordPress admin, open{' '}
                  <b>WooCommerce → Settings → Advanced → Webhooks</b>.
                </li>
                <li>
                  Click <b>Add webhook</b> once for each topic below: Status{' '}
                  <b>Active</b>, API version <b>WP REST API Integration v3</b>{' '}
                  (or the latest), the Delivery URL and Secret below.
                </li>
              </ol>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Delivery URL</Label>
                <CopyField value={store.webhook_url} />
              </div>
              {!readOnly && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Secret</Label>
                  {secret ? (
                    <CopyField value={secret} secret />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={revealSecret}
                      disabled={busy === 'secret'}
                    >
                      {busy === 'secret' && <Loader2 className="size-4 animate-spin" />}
                      Show secret
                    </Button>
                  )}
                </div>
              )}
              <ul className="divide-border divide-y text-sm">
                {topics.map((t) => (
                  <li
                    key={t.topic}
                    className="flex flex-wrap justify-between gap-2 py-1.5"
                  >
                    <span className="text-foreground">
                      {t.adminName} <code className="text-xs">({t.topic})</code>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t.drives}
                    </span>
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground text-xs">
                    Think the secret leaked? Generate a new one, then update it in
                    both WooCommerce webhooks.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => connect(true)}
                    disabled={busy === 'rotate'}
                  >
                    {busy === 'rotate' ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Generate new secret
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
                <p className="text-foreground text-base font-bold tracking-tight">
                  Connect your WooCommerce store
                </p>
                <p className="text-muted-foreground text-xs">
                  We create a delivery URL and a secret; you paste them into WooCommerce. No passwords or API keys needed.
                </p>
              </div>
            </div>
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://mystore.com"
              disabled={readOnly}
            />
            <Button
              onClick={() => connect(false)}
              disabled={readOnly || busy === 'connect' || !urlInput}
              className="w-full sm:w-auto"
            >
              {busy === 'connect' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShoppingCart className="size-4" />
              )}
              Get webhook URL and secret
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
              Pick an approved template for each event and choose what fills
              each {'{{1}}'}, {'{{2}}'}… Create templates in Templates (use the
              Utility category for order updates).
            </p>
          </div>
          {connected && !readOnly && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="woo-test-phone"
                  className="text-muted-foreground text-xs"
                >
                  Send tests to
                </Label>
                <Input
                  id="woo-test-phone"
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
          events={WOO_EVENTS}
          meta={WOO_EVENT_META}
          variables={WOO_VARIABLES}
          rules={rules}
          templates={templates}
          readOnly={readOnly}
          canTest={!!connected && !readOnly}
          icons={EVENT_ICONS}
          testingEvent={
            busy?.startsWith('test:') ? (busy.slice(5) as WooEvent) : null
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
          label: `${row.event ? (WOO_EVENT_META[row.event]?.label ?? row.event) : row.topic}${
            row.order_number ? ` · ${row.order_number}` : ''
          }${row.topic === 'test' ? ' · test' : ''}`,
          phone: row.phone,
          detail: row.detail,
          created_at: row.created_at,
        }))}
      />
    </section>
  );
}
