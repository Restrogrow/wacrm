'use client';

// ============================================================
// InboundHooksSettings - Integrations -> Webhooks & alerts -> Inbound webhooks
//
// Admins create named webhook URLs. Zapier, Make, n8n, Google Forms,
// Typeform or any website form POSTs a contact to the URL and it lands in
// Contacts (tagged, with custom fields, optionally welcomed with an
// approved WhatsApp template). The full URL is shown once, on creation.
// API: /api/integrations/inbound-hooks (see lib/inbound-hooks/process.ts).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckCircle2, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2, Webhook, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { SettingsPanelHead } from './settings-panel-head';

interface Hook {
  id: string;
  name: string;
  token_prefix: string;
  allow_send: boolean;
  default_tags: string[];
  default_country_code: string;
  enabled: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Delivery {
  id: string;
  hook_id: string;
  status: 'ok' | 'skipped' | 'failed';
  phone: string | null;
  detail: string | null;
  created_at: string;
}

function fmt(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function CopyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted min-w-0 flex-1 truncate rounded-xl px-3 py-2 font-mono text-xs">{value}</code>
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

function curlExample(url: string): string {
  return `curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "+919876543210",
    "name": "Asha Rao",
    "email": "asha@example.com",
    "tags": ["Website lead"],
    "custom_fields": { "City": "Pune" },
    "note": "Asked about the Pro plan",
    "message_template": { "name": "welcome_lead", "language": "en_US", "params": ["Asha"] }
  }'`;
}

export function InboundHooksSettings() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<string | null>(null);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [maxHooks, setMaxHooks] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [allowSend, setAllowSend] = useState(false);
  const [tagsText, setTagsText] = useState('');
  const [reveal, setReveal] = useState<{ name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/inbound-hooks', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json.code === 'missing_table') {
        setMissing(json.error);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load webhooks');
        return;
      }
      setHooks(json.hooks ?? []);
      setDeliveries(json.deliveries ?? []);
      setMaxHooks(json.max_hooks ?? 10);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy('create');
    try {
      const res = await fetch('/api/integrations/inbound-hooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          allow_send: allowSend,
          default_tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not create the webhook');
        return;
      }
      setReveal({ name: json.hook.name, url: json.url });
      setName('');
      setTagsText('');
      setAllowSend(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/integrations/inbound-hooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not save');
        return;
      }
      setHooks((hs) => hs.map((h) => (h.id === id ? { ...h, ...json.hook } : h)));
    } finally {
      setBusy(null);
    }
  }

  async function rotate(h: Hook) {
    if (!window.confirm(`Create a new URL for "${h.name}"? The current URL stops working immediately.`)) return;
    setBusy(h.id);
    try {
      const res = await fetch(`/api/integrations/inbound-hooks/${h.id}/rotate`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not create a new URL');
        return;
      }
      setReveal({ name: h.name, url: json.url });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(h: Hook) {
    if (!window.confirm(`Delete "${h.name}"? Anything still posting to its URL will get an error.`)) return;
    setBusy(h.id);
    try {
      const res = await fetch(`/api/integrations/inbound-hooks/${h.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not delete the webhook');
        return;
      }
      toast.success('Webhook deleted');
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
        <SettingsPanelHead icon={Webhook} title="Inbound webhooks" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">{missing}</CardContent>
        </Card>
      </section>
    );
  }

  const exampleUrl = reveal?.url ?? 'https://repeatgrow.com/api/hooks/in/whk_…';
  const hookName = (id: string) => hooks.find((h) => h.id === id)?.name ?? 'Deleted webhook';

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Webhook}
        title="Inbound webhooks"
        description="Send leads from Zapier, Make, n8n, Google Forms, Typeform or your own website straight into Contacts. Each webhook has its own secret URL."
      />

      {reveal && (
        <Card className="border-primary/40">
          <CardContent className="space-y-3 py-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="text-primary size-4" /> URL for &ldquo;{reveal.name}&rdquo;. Copy it now, it is not shown again.
            </p>
            <CopyBox value={reveal.url} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setReveal(null)}>
              I have saved it
            </Button>
          </CardContent>
        </Card>
      )}

      {canEditSettings && (
        <Card>
          <CardContent className="space-y-4 py-5">
            <h3 className="text-sm font-bold">New webhook</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hook-name">Name</Label>
                <Input id="hook-name" value={name} maxLength={80} placeholder="Website contact form" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook-tags">Tags for every contact (optional)</Label>
                <Input id="hook-tags" value={tagsText} placeholder="Website lead, Pune" onChange={(e) => setTagsText(e.target.value)} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={allowSend} onChange={(e) => setAllowSend(e.target.checked)} />
              <span>
                Allow this webhook to send an approved WhatsApp template to the contact
                <span className="text-muted-foreground block text-xs">
                  Off by default. Only send to people who agreed to hear from you; contacts who opted out are always skipped.
                </span>
              </span>
            </label>
            <Button type="button" onClick={create} disabled={!name.trim() || busy === 'create' || hooks.length >= maxHooks}>
              {busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create webhook
            </Button>
            {hooks.length >= maxHooks && <p className="text-muted-foreground text-xs">You have reached the limit of {maxHooks} webhooks.</p>}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {hooks.length === 0 && <p className="text-muted-foreground text-sm">No webhooks yet.</p>}
        {hooks.map((h) => (
          <Card key={h.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{h.name}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {h.token_prefix}… · last used {fmt(h.last_used_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      disabled={!canEditSettings || busy === h.id}
                      onChange={(e) => patch(h.id, { enabled: e.target.checked })}
                    />
                    On
                  </label>
                  {canEditSettings && (
                    <>
                      <Button type="button" variant="outline" size="sm" disabled={busy === h.id} onClick={() => rotate(h)}>
                        <RefreshCw className="size-4" /> New URL
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy === h.id} onClick={() => remove(h)}>
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={h.allow_send}
                  disabled={!canEditSettings || busy === h.id}
                  onChange={(e) => patch(h.id, { allow_send: e.target.checked })}
                />
                <span>Allow sending WhatsApp templates</span>
              </label>
              {h.default_tags.length > 0 && (
                <p className="text-muted-foreground text-xs">Always tagged: {h.default_tags.join(', ')}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h3 className="text-sm font-bold">How to use it</h3>
          <p className="text-muted-foreground text-sm">
            Send a POST with JSON. Only <code>phone</code> is required. National Indian numbers (98765 43210) get +91 automatically.
            Custom fields are filled only if a field with that exact name already exists in Settings.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-xl p-3 text-xs leading-relaxed">{curlExample(exampleUrl)}</pre>
          <div className="text-muted-foreground space-y-1 text-sm">
            <p>
              <strong className="text-foreground">Zapier:</strong> trigger (Google Forms, Typeform, Facebook Lead Ads…) → action <em>Webhooks by Zapier → POST</em> → paste the URL → Payload Type <em>Json</em> → map the fields above.
            </p>
            <p>
              <strong className="text-foreground">Make:</strong> add an <em>HTTP → Make a request</em> module → method POST, body type <em>Raw</em>, content type <em>JSON</em> → paste the JSON with your fields mapped.
            </p>
            <p>
              <strong className="text-foreground">n8n / your website:</strong> any HTTP Request node or <code>fetch()</code> call works. Form-encoded bodies are accepted too.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h3 className="text-sm font-bold">Recent deliveries</h3>
          {deliveries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing received yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {deliveries.map((d) => (
                <li key={d.id} className="flex items-start gap-3 py-2">
                  {d.status === 'failed' ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      <span className="font-medium">{hookName(d.hook_id)}</span>
                      {d.phone ? <span className="text-muted-foreground"> · {d.phone}</span> : null}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{d.detail}</p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">{fmt(d.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
