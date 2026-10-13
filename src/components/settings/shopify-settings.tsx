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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Loader2,
  Save,
  Send,
  ShoppingBag,
  Unplug,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { createClient } from '@/lib/supabase/client';
import {
  EVENT_META,
  SHOPIFY_EVENTS,
  SHOPIFY_VARIABLES,
  countBodyVariables,
  type ShopifyEvent,
  type ShopifyVariable,
} from '@/lib/shopify/events';
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

interface TemplateOption {
  name: string;
  language: string;
  category: string;
  body_text: string;
}

const templateKey = (name: string | null, language: string | null) =>
  name ? `${name}::${language || 'en_US'}` : '';

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

function fmtTime(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
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
  const [rules, setRules] = useState<Record<ShopifyEvent, Rule>>(
    () =>
      Object.fromEntries(
        SHOPIFY_EVENTS.map((e) => [e, emptyRule(e)])
      ) as Record<ShopifyEvent, Rule>
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

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
    void (async () => {
      const { data } = await createClient()
        .from('message_templates')
        .select('name, language, category, body_text')
        .eq('status', 'APPROVED')
        .order('name');
      setTemplates((data ?? []) as TemplateOption[]);
    })();
  }, [load]);

  // Result of the OAuth round-trip (/api/integrations/shopify/callback).
  useEffect(() => {
    const error = searchParams.get('shopify_error');
    if (error) toast.error(error);
    if (searchParams.get('shopify') === 'connected')
      toast.success('Shopify store connected');
  }, [searchParams]);

  const templateByKey = useMemo(
    () => new Map(templates.map((t) => [templateKey(t.name, t.language), t])),
    [templates]
  );

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
        <SettingsPanelHead title="Shopify" />
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
        title="Shopify"
        description="Send WhatsApp messages automatically when customers order, when orders ship or are delivered, and when carts are abandoned. Messages appear in your inbox like any other chat."
      />

      {/* ---------------- Connection ---------------- */}
      {connected ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <ShoppingBag className="text-primary size-5" />
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
                    {fmtTime(store.last_event_at)}
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
              <div className="border-border space-y-3 rounded-lg border p-4">
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="py-5">
              {/* A real navigation: the install route redirects to Shopify. */}
              <form
                action="/api/integrations/shopify/install"
                method="get"
                className="space-y-3"
              >
                <p className="text-foreground font-medium">Connect Shopify</p>
                <p className="text-muted-foreground text-sm">
                  One click: approve Repeat Grow in Shopify and we set
                  everything up for you.
                </p>
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
            <CardContent className="space-y-3 py-5">
              <p className="text-foreground font-medium">
                Connect with webhooks
              </p>
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
            <h3 className="text-foreground text-sm font-semibold">Messages</h3>
            <p className="text-muted-foreground text-xs">
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

        {templates.length === 0 && (
          <p className="text-muted-foreground mb-3 text-sm">
            You don&apos;t have any approved templates yet.
          </p>
        )}

        <div className="space-y-3">
          {SHOPIFY_EVENTS.map((event) => {
            const rule = rules[event];
            const meta = EVENT_META[event];
            const template = templateByKey.get(
              templateKey(rule.template_name, rule.template_language)
            );
            const varCount = countBodyVariables(template?.body_text);
            const preview = template?.body_text.replace(
              /\{\{\s*(\d+)\s*\}\}/g,
              (_m, n) => {
                const key = rule.body_variables[Number(n) - 1];
                return (
                  SHOPIFY_VARIABLES.find((v) => v.key === key)?.example ??
                  `{{${n}}}`
                );
              }
            );
            return (
              <Card key={event}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-medium">
                        {meta.label}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {meta.description}
                      </p>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) =>
                        updateRule(event, { enabled: checked })
                      }
                      aria-label={`Send ${meta.label} message`}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-muted-foreground text-xs">
                        Template
                      </Label>
                      <Select
                        value={templateKey(
                          rule.template_name,
                          rule.template_language
                        )}
                        onValueChange={(value) => {
                          const t = templateByKey.get(value ?? '');
                          updateRule(event, {
                            template_name: t?.name ?? null,
                            template_language: t?.language ?? null,
                            body_variables: Array.from(
                              { length: countBodyVariables(t?.body_text) },
                              (_, i) =>
                                rule.body_variables[i] ??
                                SHOPIFY_VARIABLES[i]?.key ??
                                'customer_name'
                            ),
                          });
                        }}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="bg-muted w-full">
                          <SelectValue placeholder="Choose a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem
                              key={templateKey(t.name, t.language)}
                              value={templateKey(t.name, t.language)}
                            >
                              {t.name} ({t.language}) · {t.category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {event === 'abandoned_checkout' && (
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
                            updateRule(event, {
                              delay_minutes: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}
                  </div>

                  {varCount > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: varCount }, (_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-muted-foreground w-10 shrink-0 font-mono text-xs">
                            {`{{${i + 1}}}`}
                          </span>
                          <Select
                            value={rule.body_variables[i] ?? ''}
                            onValueChange={(value) => {
                              const vars = [...rule.body_variables];
                              vars[i] = (value ??
                                'customer_name') as ShopifyVariable;
                              updateRule(event, { body_variables: vars });
                            }}
                            disabled={readOnly}
                          >
                            <SelectTrigger className="bg-muted w-full">
                              <SelectValue placeholder="Choose a value" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHOPIFY_VARIABLES.map((v) => (
                                <SelectItem key={v.key} value={v.key}>
                                  {v.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  )}

                  {preview && (
                    <p className="bg-muted/60 text-foreground rounded-md px-3 py-2 text-xs whitespace-pre-wrap">
                      {preview}
                    </p>
                  )}

                  {connected && !readOnly && rule.template_name && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendTest(event)}
                      disabled={busy === `test:${event}`}
                    >
                      {busy === `test:${event}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Send test
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!readOnly && (
          <div className="mt-4 flex justify-end">
            <Button onClick={saveRules} disabled={!dirty || busy === 'rules'}>
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
      {activity.length > 0 && (
        <div>
          <h3 className="text-foreground mb-2 text-sm font-semibold">
            Recent messages
          </h3>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-border divide-y">
                {activity.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <Badge
                      variant={
                        row.status === 'sent'
                          ? 'default'
                          : row.status === 'failed'
                            ? 'destructive'
                            : 'outline'
                      }
                      className="w-fit"
                    >
                      {row.status}
                    </Badge>
                    <span className="text-foreground text-sm">
                      {row.event
                        ? (EVENT_META[row.event]?.label ?? row.event)
                        : row.topic}
                      {row.order_name ? ` · ${row.order_name}` : ''}
                      {row.topic === 'test' ? ' · test' : ''}
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                      {row.phone ? `+${row.phone}` : ''}
                      {row.detail ? ` — ${row.detail}` : ''}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {fmtTime(row.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
