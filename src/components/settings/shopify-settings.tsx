'use client';

// ============================================================
// ShopifySettings — Settings → Shopify
//
// Connect a Shopify store (OAuth app, or webhooks created by hand in
// Shopify admin) and choose which approved WhatsApp template to send
// for each store event, filling {{1}}, {{2}}, … from order data.
// Any member can view; admin+ can connect, edit and send tests.
// API: /api/integrations/shopify (see lib/shopify/process.ts).
// ============================================================

import { IconChip } from '@/components/icon-chip';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Clock, Copy, CreditCard, Loader2, MessageSquare, Package, PackageCheck, Save, ShoppingBag, ShoppingCart, Truck, Unplug, Webhook, XCircle, Zap, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import {
  EVENT_META,
  SHOPIFY_EVENTS,
  SHOPIFY_VARIABLES,
  type ShopifyEvent,
  type ShopifyVariable,
} from '@/lib/shopify/events';
import {
  IntegrationActivity,
  MessageRulesEditor,
  fmtActivityTime,
  useApprovedTemplates,
} from './integration-message-rules';
import { SettingsPanelHead } from './settings-panel-head';

interface StoreInfo {
  shop_domain: string;
  shop_name: string | null;
  connection_type: 'oauth' | 'webhook';
  default_country_code: string;
  status: 'active' | 'disconnected';
  last_event_at: string | null;
  created_at: string;
  webhook_url: string | null;
}

type SyncPart = Record<string, number | string>;

interface SyncInfo {
  interval_minutes: number;
  last_synced_at: string | null;
  last_sync_error: string | null;
  summary: { products?: SyncPart; customers?: SyncPart; orders?: SyncPart } | null;
  missing_scopes: string[];
}

/** One line per synced part: "12 new · 3 updated", or why it was skipped. */
function syncPartText(part: SyncPart | undefined): string {
  if (!part) return 'Not synced yet';
  if (part.error) return `Failed: ${part.error}`;
  if (part.skipped) return String(part.skipped);
  const bits: string[] = [];
  if (part.created !== undefined) bits.push(`${part.created} new`);
  if (part.updated !== undefined) bits.push(`${part.updated} updated`);
  if (part.added !== undefined) bits.push(`${part.added} missed orders added`);
  if (part.over_limit) bits.push(`${part.over_limit} over plan limit`);
  return bits.join(' · ') || 'Up to date';
}

interface Rule {
  event: ShopifyEvent;
  enabled: boolean;
  template_name: string | null;
  template_language: string | null;
  body_variables: ShopifyVariable[];
  delay_minutes: number;
}

interface ActivityRow {
  id: string;
  topic: string;
  event: ShopifyEvent | null;
  order_name: string | null;
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
  order_placed: ShoppingBag,
  cod_order_placed: CreditCard,
  order_shipped: Truck,
  out_for_delivery: Package,
  order_delivered: PackageCheck,
  order_cancelled: XCircle,
  abandoned_checkout: ShoppingCart,
};

function emptyRule(event: ShopifyEvent): Rule {
  return {
    event,
    enabled: false,
    template_name: null,
    template_language: null,
    body_variables: [],
    delay_minutes: 60,
  };
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono text-xs">
        {value}
      </code>
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

export function ShopifySettings() {
  const { canEditSettings } = useAuth();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [rules, setRules] = useState<Record<ShopifyEvent, Rule>>(
    () =>
      Object.fromEntries(
        SHOPIFY_EVENTS.map((e) => [e, emptyRule(e)])
      ) as Record<ShopifyEvent, Rule>
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const templates = useApprovedTemplates();

  const [shopInput, setShopInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [countryCode, setCountryCode] = useState('91');
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/shopify', {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissingTable(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load Shopify settings');
        return;
      }
      setOauthAvailable(json.oauth_available);
      setTopics(json.topics ?? []);
      setStore(json.store);
      setSync(json.sync ?? null);
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

  // Result of the OAuth round-trip (/api/integrations/shopify/callback).
  useEffect(() => {
    const error = searchParams.get('shopify_error');
    if (error) toast.error(error);
    if (searchParams.get('shopify') === 'connected')
      toast.success('Shopify store connected');
  }, [searchParams]);

  const readOnly = !canEditSettings;

  const updateRule = (event: ShopifyEvent, patch: Partial<Rule>) => {
    setRules((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }));
    setDirty(true);
  };

  async function connectManual() {
    setBusy('manual');
    try {
      const res = await fetch('/api/integrations/shopify/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_domain: shopInput || store?.shop_domain,
          webhook_secret: secretInput,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      toast.success('Saved. Now add the webhooks in Shopify (steps below).');
      setSecretInput('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const res = await fetch('/api/integrations/shopify', {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Could not disconnect');
        return;
      }
      toast.success('Store disconnected');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveCountryCode() {
    setBusy('country');
    try {
      const res = await fetch('/api/integrations/shopify', {
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
      const res = await fetch('/api/integrations/shopify/rules', {
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

  async function sendTest(event: ShopifyEvent) {
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
      const res = await fetch('/api/integrations/shopify/test', {
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
        <SettingsPanelHead icon={ShoppingBag} title="Shopify" />
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
        icon={ShoppingBag}
        title="Shopify"
        description="Send WhatsApp messages automatically when customers order, when orders ship or are delivered, and when carts are abandoned. Messages appear in your inbox like any other chat."
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
          { label: 'Store', value: connected ? (store?.shop_name || store?.shop_domain || '—') : 'Not connected', icon: ShoppingBag, tone: 'bg-primary text-primary-foreground shadow-primary/30' },
          { label: 'Messages sent', value: String(activity.filter((r) => r.status === 'sent').length), icon: MessageSquare, tone: 'bg-sky-500 text-white shadow-sky-500/30' },
          { label: 'Active automations', value: `${Object.values(rules).filter((r) => r.enabled).length} / ${SHOPIFY_EVENTS.length}`, icon: Zap, tone: 'bg-amber-500 text-white shadow-amber-500/30' },
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
                  <ShoppingBag className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate font-medium">
                      {store.shop_name || store.shop_domain}
                    </span>
                    <Badge className="border-primary/40 bg-primary/10 text-primary text-[10px] tracking-wide uppercase">
                      Connected
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {store.connection_type === 'oauth'
                        ? 'Shopify app'
                        : 'Webhooks'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {store.shop_domain} · last event{' '}
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

            {sync && (
              <div className="border-border bg-muted/30 space-y-2 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-foreground text-sm font-medium">
                    Auto-sync every {sync.interval_minutes} minutes
                  </p>
                  <span className="text-muted-foreground text-xs">
                    Last sync {fmtActivityTime(sync.last_synced_at)}
                  </span>
                </div>
                <dl className="text-muted-foreground grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
                  <dt className="text-foreground font-medium">Products → Catalog</dt>
                  <dd>{syncPartText(sync.summary?.products)}</dd>
                  <dt className="text-foreground font-medium">Customers → Contacts</dt>
                  <dd>{syncPartText(sync.summary?.customers)}</dd>
                  <dt className="text-foreground font-medium">Missed orders</dt>
                  <dd>{syncPartText(sync.summary?.orders)}</dd>
                </dl>
                {sync.missing_scopes.length > 0 && !readOnly && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <span>
                      Reconnect once to allow product and customer access in Shopify.
                    </span>
                    {/* A real navigation: the install route redirects to Shopify. */}
                    <a
                      href={`/api/integrations/shopify/install?shop=${encodeURIComponent(store.shop_domain)}`}
                      className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground"
                    >
                      Reconnect Shopify
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label
                htmlFor="shopify-cc"
                className="text-muted-foreground text-xs"
              >
                Country code for numbers saved without one
              </Label>
              <div className="flex gap-2">
                <Input
                  id="shopify-cc"
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

            {store.connection_type === 'webhook' && store.webhook_url && (
              <div className="border-border bg-muted/30 space-y-3 rounded-2xl border p-4">
                <p className="text-foreground text-sm font-medium">
                  Webhooks to add in Shopify
                </p>
                <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
                  <li>
                    In Shopify admin, open{' '}
                    <b>Settings → Notifications → Webhooks</b>.
                  </li>
                  <li>
                    Click <b>Create webhook</b> once for each event below:
                    Format <b>JSON</b>, URL below, the latest API version.
                  </li>
                </ol>
                <CopyField value={store.webhook_url} />
                <ul className="divide-border divide-y text-sm">
                  {topics.map((t) => (
                    <li
                      key={t.topic}
                      className="flex flex-wrap justify-between gap-2 py-1.5"
                    >
                      <span className="text-foreground">{t.adminName}</span>
                      <span className="text-muted-foreground text-xs">
                        {t.drives}
                      </span>
                    </li>
                  ))}
                </ul>
                {!readOnly && (
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="shopify-secret-update"
                      className="text-muted-foreground text-xs"
                    >
                      Signing key changed? Paste the new one
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="shopify-secret-update"
                        value={secretInput}
                        onChange={(e) => setSecretInput(e.target.value)}
                        placeholder="Key shown under the webhooks list"
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={connectManual}
                        disabled={!secretInput || busy === 'manual'}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="ring-2 ring-primary/30">
            <CardContent>
              {/* A real navigation: the install route redirects to Shopify. */}
              <form
                action="/api/integrations/shopify/install"
                method="get"
                className="space-y-3"
              >
                <div className="flex items-center gap-3">
                  <IconChip icon={Zap} className="size-11 rounded-2xl" />
                  <div>
                    <p className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
                      Connect Shopify
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">Recommended</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      One click: approve Repeat Grow in Shopify and we set everything up for you.
                    </p>
                  </div>
                </div>
                <Input
                  name="shop"
                  required
                  value={shopInput}
                  onChange={(e) => setShopInput(e.target.value)}
                  placeholder="mystore.myshopify.com"
                  disabled={readOnly || !oauthAvailable}
                />
                <Button
                  type="submit"
                  disabled={readOnly || !oauthAvailable}
                  className="w-full"
                >
                  <ShoppingBag className="size-4" />
                  Connect Shopify
                </Button>
                {!oauthAvailable && (
                  <p className="text-muted-foreground text-xs">
                    Not available yet on this server — use webhooks instead.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Webhook className="size-5" />
                </span>
                <p className="text-foreground text-base font-bold tracking-tight">
                  Connect with webhooks
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                Works on every store. In Shopify admin open{' '}
                <b>Settings → Notifications → Webhooks</b> and copy the key
                shown under &ldquo;Your webhooks will be signed with&rdquo;. (If
                no key shows yet, create any webhook first.)
              </p>
              <Input
                value={shopInput}
                onChange={(e) => setShopInput(e.target.value)}
                placeholder="mystore.myshopify.com"
                disabled={readOnly}
              />
              <Input
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Webhook signing key"
                className="font-mono text-xs"
                disabled={readOnly}
              />
              <Button
                variant="outline"
                onClick={connectManual}
                disabled={
                  readOnly || busy === 'manual' || !shopInput || !secretInput
                }
                className="w-full"
              >
                {busy === 'manual' && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Save and get webhook URL
              </Button>
            </CardContent>
          </Card>
        </div>
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
              each {'{{1}}'}, {'{{2}}'}… Create templates in Settings →
              Templates (use the Utility category for order updates).
            </p>
          </div>
          {connected && !readOnly && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="shopify-test-phone"
                  className="text-muted-foreground text-xs"
                >
                  Send tests to
                </Label>
                <Input
                  id="shopify-test-phone"
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
          events={SHOPIFY_EVENTS}
          meta={EVENT_META}
          variables={SHOPIFY_VARIABLES}
          rules={rules}
          templates={templates}
          readOnly={readOnly}
          canTest={!!connected && !readOnly}
          icons={EVENT_ICONS}
          testingEvent={
            busy?.startsWith('test:') ? (busy.slice(5) as ShopifyEvent) : null
          }
          onChange={updateRule}
          onTest={sendTest}
          renderExtra={(event, rule) =>
            event === 'abandoned_checkout' ? (
              <div className="flex flex-col gap-1">
                <Label className="text-muted-foreground text-xs">
                  Send after (minutes idle)
                </Label>
                <Input
                  type="number"
                  min={15}
                  max={10080}
                  value={rule.delay_minutes}
                  disabled={readOnly}
                  onChange={(e) =>
                    updateRule(event, { delay_minutes: Number(e.target.value) })
                  }
                />
              </div>
            ) : null
          }
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
          label: `${row.event ? (EVENT_META[row.event]?.label ?? row.event) : row.topic}${
            row.order_name ? ` · ${row.order_name}` : ''
          }${row.topic === 'test' ? ' · test' : ''}`,
          phone: row.phone,
          detail: row.detail,
          created_at: row.created_at,
        }))}
      />
    </section>
  );
}
