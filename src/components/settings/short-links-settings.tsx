'use client';

// ============================================================
// ShortLinksSettings — Settings → Short links
//
// Create short, trackable links (repeatgrow.com/l/abc123) for messages,
// ads, bios and printed QR codes, and see clicks over time. Admins create
// and manage links; every member can read the stats. API: /api/short-links.
// Clicks are counted by day, device type and referring website only.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, Plus, QrCode, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

export interface ShortLinkRow {
  id: string;
  code: string;
  short_url: string;
  target_url: string;
  label: string;
  is_active: boolean;
  total_clicks: number;
  last_clicked_at: string | null;
  created_at: string;
  clicks_30d: number;
  series: number[];
  devices: Record<string, number>;
  top_referrers: { host: string; clicks: number }[];
}

function Sparkline({ series }: { series: number[] }) {
  const max = Math.max(1, ...series);
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {series.map((n, i) => (
        <div key={i} className="bg-primary/60 min-h-px w-1 rounded-sm" style={{ height: `${Math.max(4, (n / max) * 100)}%` }} />
      ))}
    </div>
  );
}

async function downloadQr(link: ShortLinkRow) {
  const url = await QRCode.toDataURL(link.short_url, { margin: 2, width: 640, errorCorrectionLevel: 'M' });
  const a = document.createElement('a');
  a.href = url;
  a.download = `short-link-${link.code}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ShortLinksSettings() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [links, setLinks] = useState<ShortLinkRow[]>([]);
  const [creating, setCreating] = useState(false);

  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [showUtm, setShowUtm] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/short-links', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        setAvailable(false);
        return;
      }
      setAvailable(body.available !== false);
      setLinks(body.links ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch('/api/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_url: target,
          label,
          code: code || undefined,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Could not create the link.');
        return;
      }
      setLinks((prev) => [body.link, ...prev]);
      setTarget('');
      setLabel('');
      setCode('');
      void navigator.clipboard.writeText(body.link.short_url).catch(() => {});
      toast.success('Link created and copied');
    } finally {
      setCreating(false);
    }
  }

  async function toggle(l: ShortLinkRow, active: boolean) {
    setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, is_active: active } : x)));
    const res = await fetch(`/api/short-links/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    });
    if (!res.ok) {
      toast.error('Could not change the link.');
      void load();
    }
  }

  async function remove(l: ShortLinkRow) {
    if (!window.confirm(`Delete ${l.short_url}? Anyone using it (printed QR codes, old messages) will get an error page.`)) return;
    const res = await fetch(`/api/short-links/${l.id}`, { method: 'DELETE' });
    if (res.ok) {
      setLinks((prev) => prev.filter((x) => x.id !== l.id));
      toast.success('Deleted');
    } else {
      toast.error('Could not delete the link.');
    }
  }

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
        <SettingsPanelHead icon={Link2} title="Short links" description="Trackable short links for your messages and ads." />
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            Short links aren&apos;t set up on this server yet. Run <code>supabase/migrations/073_widget_shortlinks.sql</code> in the Supabase SQL
            Editor, then refresh.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Link2}
        title="Short links"
        description="Make short links you can paste into WhatsApp messages, ads, Instagram bios or print as QR codes, and see how many people tap them."
      />

      {canEditSettings ? (
        <Card>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sl-target">Link to shorten</Label>
              <Input id="sl-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://yourstore.com/diwali-offer" inputMode="url" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sl-label">Name (only you see this)</Label>
                <Input id="sl-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Diwali broadcast" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sl-code">Custom ending (optional)</Label>
                <Input
                  id="sl-code"
                  value={code}
                  maxLength={32}
                  onChange={(e) => setCode(e.target.value.toLowerCase())}
                  placeholder="diwali"
                />
              </div>
            </div>
            <button type="button" className="text-primary text-xs font-medium underline-offset-2 hover:underline" onClick={() => setShowUtm((v) => !v)}>
              {showUtm ? 'Hide' : 'Add'} campaign tracking (UTM)
            </button>
            {showUtm && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="utm_source (whatsapp)" aria-label="UTM source" />
                <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="utm_medium (broadcast)" aria-label="UTM medium" />
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="utm_campaign (diwali)" aria-label="UTM campaign" />
              </div>
            )}
            <Button onClick={create} disabled={creating || !target.trim()}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create short link
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">Only admins can create or change links.</p>
      )}

      {links.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-center text-sm">No short links yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <Card key={l.id} className={cn(!l.is_active && 'opacity-60')}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-semibold">{l.label || l.short_url}</p>
                    <p className="text-primary text-xs break-all">{l.short_url}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs" title={l.target_url}>
                      → {l.target_url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(l.short_url);
                        toast.success('Copied');
                      }}
                    >
                      <Copy className="size-3.5" /> Copy
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void downloadQr(l)} aria-label="Download QR code">
                      <QrCode className="size-3.5" /> QR
                    </Button>
                    {canEditSettings && (
                      <>
                        <Switch checked={l.is_active} onCheckedChange={(v) => void toggle(l, v)} aria-label={l.is_active ? 'Turn link off' : 'Turn link on'} />
                        <Button type="button" size="sm" variant="ghost" onClick={() => void remove(l)} aria-label="Delete link">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xl font-bold">{l.total_clicks}</p>
                      <p className="text-muted-foreground text-xs">Total clicks</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold">{l.clicks_30d}</p>
                      <p className="text-muted-foreground text-xs">Last 30 days</p>
                    </div>
                  </div>
                  <Sparkline series={l.series} />
                  <div className="text-muted-foreground text-xs">
                    {Object.keys(l.devices).length > 0 && (
                      <p>
                        {Object.entries(l.devices)
                          .sort((a, b) => b[1] - a[1])
                          .map(([d, n]) => `${d} ${n}`)
                          .join(' · ')}
                      </p>
                    )}
                    {l.top_referrers.length > 0 && <p>{l.top_referrers.map((r) => `${r.host} (${r.clicks})`).join(', ')}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
