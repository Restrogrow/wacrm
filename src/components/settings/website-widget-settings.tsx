'use client';

// ============================================================
// WebsiteWidgetSettings — Settings → Website chat widget
//
// Configure the floating "Chat on WhatsApp" button customers add to their
// website with one script tag, preview it live, and see impressions /
// clicks for the last 30 days. Saved through /api/widget-config (admins).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Globe, Loader2, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { normalizeWaNumber } from '@/lib/wa-link';
import { DEFAULT_WIDGET, WIDGET_COLORS, WIDGET_LIMITS, type WidgetConfig } from '@/lib/widget/core';
import { SettingsPanelHead } from './settings-panel-head';

interface Loaded {
  available: boolean;
  widget: { public_id: string; snippet: string; config: WidgetConfig } | null;
  stats: { days: { day: string; impressions: number; clicks: number }[]; impressions: number; clicks: number } | null;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-foreground text-sm font-semibold">{label}</p>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

/** A static look-alike of the real widget, driven by the form values. */
function WidgetPreview({ c, offline }: { c: WidgetConfig; offline: boolean }) {
  const [open, setOpen] = useState(true);
  const side = c.position === 'left' ? 'left-4 items-start' : 'right-4 items-end';
  return (
    <div className="bg-muted/50 border-border relative h-80 overflow-hidden rounded-xl border">
      <p className="text-muted-foreground absolute top-3 left-4 text-xs">Preview of your website</p>
      <div className={cn('absolute bottom-4 flex flex-col gap-2', side)}>
        {open && (
          <div className="w-64 max-w-[85%] overflow-hidden rounded-xl bg-white text-sm text-neutral-900 shadow-xl">
            <div className="flex items-center justify-between px-3 py-2.5 font-semibold text-white" style={{ background: c.color }}>
              <span className="truncate">{c.button_label || 'Chat with us'}</span>
              <button type="button" aria-label="Close preview" onClick={() => setOpen(false)} className="text-lg leading-none">
                ×
              </button>
            </div>
            <div className="p-3">
              <p>{offline && c.hours_aware ? c.offline_text : c.greeting}</p>
              {c.collect_name && <div className="mt-2 rounded-md border border-neutral-300 px-2 py-1.5 text-neutral-500">Your name</div>}
              <div className="mt-3 rounded-md py-2 text-center font-semibold text-white" style={{ background: c.color }}>
                Start chat on WhatsApp
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ background: c.color }}
        >
          <MessageCircle className="size-4" />
          {c.button_label || 'Chat with us'}
        </button>
      </div>
    </div>
  );
}

export function WebsiteWidgetSettings() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<WidgetConfig>(DEFAULT_WIDGET);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [stats, setStats] = useState<Loaded['stats']>(null);
  const [previewOffline, setPreviewOffline] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/widget-config', { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as Loaded | null;
      if (!res.ok || !body) {
        setAvailable(false);
        return;
      }
      setAvailable(body.available);
      setStats(body.stats);
      if (body.widget) {
        setCfg(body.widget.config);
        setSnippet(body.widget.snippet);
      } else {
        // First visit: start from the connected WhatsApp number.
        try {
          const r = await fetch('/api/whatsapp/config');
          const w = await r.json().catch(() => null);
          const display = w?.phone_info?.display_phone_number as string | undefined;
          if (display) setCfg((p) => ({ ...p, phone: normalizeWaNumber(display) ?? '' }));
        } catch {
          // not connected yet: the admin types the number
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const patch = (p: Partial<WidgetConfig>) => setCfg((prev) => ({ ...prev, ...p }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/widget-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not save the widget.');
        return;
      }
      setSnippet(body.snippet);
      toast.success(cfg.enabled ? 'Saved. Your widget is live.' : 'Saved');
      void load();
    } finally {
      setSaving(false);
    }
  }

  const ctr = useMemo(
    () => (stats && stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(1) : '0.0'),
    [stats],
  );
  const maxImp = Math.max(1, ...(stats?.days.map((d) => d.impressions) ?? [1]));

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!available) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead icon={Globe} title="Website chat widget" description="Add a WhatsApp chat button to your website." />
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            The widget isn&apos;t set up on this server yet. Run <code>supabase/migrations/073_widget_shortlinks.sql</code> in the Supabase
            SQL Editor, then refresh.
          </CardContent>
        </Card>
      </section>
    );
  }

  const readOnly = !canEditSettings;
  const phoneOk = !cfg.phone || !!normalizeWaNumber(cfg.phone);

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Globe}
        title="Website chat widget"
        description="Put a “Chat on WhatsApp” button on your website with one line of code. Visitors tap it and land in your inbox."
        action={
          canEditSettings ? (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          ) : null
        }
      />
      {readOnly && <p className="text-muted-foreground text-sm">Only admins can change these settings.</p>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5">
              <Toggle
                label="Show the widget on my website"
                hint="Off: the script does nothing, so you can leave the code installed."
                checked={cfg.enabled}
                onChange={(v) => patch({ enabled: v })}
                disabled={readOnly}
              />

              <div className="space-y-1.5">
                <Label htmlFor="wg-phone">WhatsApp number to open</Label>
                <Input
                  id="wg-phone"
                  value={cfg.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  placeholder="919876543210"
                  disabled={readOnly}
                  inputMode="tel"
                />
                <p className={cn('text-xs', phoneOk ? 'text-muted-foreground' : 'text-destructive')}>
                  {phoneOk
                    ? 'With country code. This number is visible in the chat link, so use the one customers should message.'
                    : 'Enter a valid number with country code.'}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wg-label">Button label</Label>
                  <Input
                    id="wg-label"
                    value={cfg.button_label}
                    maxLength={WIDGET_LIMITS.buttonLabel}
                    onChange={(e) => patch({ button_label: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Position</Label>
                  <div className="flex gap-2">
                    {(['right', 'left'] as const).map((p) => (
                      <Button
                        key={p}
                        type="button"
                        variant={cfg.position === p ? 'default' : 'outline'}
                        size="sm"
                        disabled={readOnly}
                        onClick={() => patch({ position: p })}
                        className="capitalize"
                      >
                        Bottom {p}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Colour</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {WIDGET_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      aria-label={`Use colour ${col}`}
                      disabled={readOnly}
                      onClick={() => patch({ color: col })}
                      className={cn('size-7 rounded-full border-2', cfg.color.toUpperCase() === col ? 'border-foreground' : 'border-transparent')}
                      style={{ background: col }}
                    />
                  ))}
                  <Input
                    value={cfg.color}
                    onChange={(e) => patch({ color: e.target.value })}
                    className="h-8 w-28 font-mono text-xs"
                    aria-label="Custom colour"
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wg-greeting">Greeting</Label>
                <Textarea
                  id="wg-greeting"
                  value={cfg.greeting}
                  maxLength={WIDGET_LIMITS.greeting}
                  rows={2}
                  onChange={(e) => patch({ greeting: e.target.value })}
                  disabled={readOnly}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wg-prefill">Pre-filled message</Label>
                <Textarea
                  id="wg-prefill"
                  value={cfg.prefill_message}
                  maxLength={WIDGET_LIMITS.prefill}
                  rows={2}
                  onChange={(e) => patch({ prefill_message: e.target.value })}
                  disabled={readOnly}
                />
                <p className="text-muted-foreground text-xs">The first message the visitor sends, so you know the chat came from your website.</p>
              </div>

              <Toggle
                label="Ask for their name first"
                hint="Shows a name box; the name is added to the pre-filled message."
                checked={cfg.collect_name}
                onChange={(v) => patch({ collect_name: v })}
                disabled={readOnly}
              />

              <Toggle
                label="Show a different message when you're closed"
                hint="Uses your Business hours settings. The button still works, it just sets expectations."
                checked={cfg.hours_aware}
                onChange={(v) => patch({ hours_aware: v })}
                disabled={readOnly}
              />
              {cfg.hours_aware && (
                <div className="space-y-1.5">
                  <Label htmlFor="wg-offline">Message outside business hours</Label>
                  <Textarea
                    id="wg-offline"
                    value={cfg.offline_text}
                    maxLength={WIDGET_LIMITS.offline}
                    rows={2}
                    onChange={(e) => patch({ offline_text: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-foreground text-sm font-semibold">Add it to your website</p>
              {snippet ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    Paste this just before <code>&lt;/body&gt;</code> on every page where the button should appear (works with WordPress, Shopify,
                    Wix, Webflow and plain HTML).
                  </p>
                  <div className="bg-muted flex items-start gap-2 rounded-lg p-3">
                    <code className="text-foreground min-w-0 flex-1 text-xs break-all">{snippet}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(snippet);
                        toast.success('Copied');
                      }}
                    >
                      <Copy className="size-3.5" /> Copy
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">Save your settings to get your code snippet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-foreground text-sm font-semibold">Live preview</p>
                {cfg.hours_aware && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOffline((v) => !v)}>
                    {previewOffline ? 'Show open' : 'Show closed'}
                  </Button>
                )}
              </div>
              <WidgetPreview c={cfg} offline={previewOffline} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <p className="text-foreground text-sm font-semibold">Last 30 days</p>
              {!stats || stats.impressions === 0 ? (
                <p className="text-muted-foreground text-xs">No visits yet. Numbers appear after the button shows on your site.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xl font-bold">{stats.impressions}</p>
                      <p className="text-muted-foreground text-xs">Views</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{stats.clicks}</p>
                      <p className="text-muted-foreground text-xs">Chats started</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{ctr}%</p>
                      <p className="text-muted-foreground text-xs">Click rate</p>
                    </div>
                  </div>
                  <div className="flex h-20 items-end gap-0.5" aria-label="Views per day">
                    {stats.days.map((d) => (
                      <div
                        key={d.day}
                        title={`${d.day}: ${d.impressions} views, ${d.clicks} chats`}
                        className="bg-primary/60 min-h-0.5 flex-1 rounded-sm"
                        style={{ height: `${Math.max(3, (d.impressions / maxImp) * 100)}%` }}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
