'use client';

// ============================================================
// Orders & payments → Razorpay payment links
//
// Admins connect their own Razorpay account (Key ID + Key Secret). Agents
// then send a payment link from any chat. After connecting, the page
// shows the webhook URL and a webhook secret ONCE: paste both into
// Razorpay (Account & Settings → Webhooks) so payments update the chat.
// API: /api/payments/razorpay/settings.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Loader2, RefreshCw, Unplug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';

interface Status {
  available: boolean;
  connected: boolean;
  key_id_masked: string | null;
  webhook_url: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="h-10 rounded-xl bg-card-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 rounded-xl"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error('Could not copy. Select the text and copy it.');
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export function RazorpayLinksCard() {
  const { canEditSettings } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [busy, setBusy] = useState(false);
  // Shown once, right after connect / regenerate.
  const [reveal, setReveal] = useState<{ url: string; secret: string } | null>(null);

  useEffect(() => {
    let off = false;
    fetch('/api/payments/razorpay/settings')
      .then((r) => r.json())
      .then((j) => !off && setStatus(j))
      .catch(() => !off && setStatus({ available: false, connected: false, key_id_masked: null, webhook_url: '' }));
    return () => {
      off = true;
    };
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch('/api/payments/razorpay/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId, key_secret: keySecret }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? 'Could not connect Razorpay.');
        return;
      }
      setStatus({ available: true, connected: true, key_id_masked: j.key_id_masked, webhook_url: j.webhook_url });
      setReveal({ url: j.webhook_url, secret: j.webhook_secret });
      setKeyId('');
      setKeySecret('');
      toast.success('Razorpay connected.');
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!window.confirm('Create a new webhook secret? You must paste it into Razorpay, or payments will stop updating.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/payments/razorpay/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate_secret' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? 'Could not create a new secret.');
        return;
      }
      setReveal({ url: j.webhook_url, secret: j.webhook_secret });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Razorpay? Agents will no longer be able to send payment links.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/payments/razorpay/settings', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not disconnect.');
        return;
      }
      setStatus((s) => (s ? { ...s, connected: false, key_id_masked: null } : s));
      setReveal(null);
      toast.success('Razorpay disconnected.');
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = canEditSettings;

  return (
    <Card className="rounded-3xl border-border bg-card shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Link2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-foreground">Razorpay payment links</h3>
            <p className="text-sm text-muted-foreground">
              Send a pay-now link in any chat. When the customer pays, the order is marked paid and they get a confirmation.
            </p>
          </div>
          {status?.connected && (
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">Connected</span>
          )}
        </div>

        {!status ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !status.available ? (
          <p className="text-sm text-muted-foreground">Not available yet. Ask your admin to run migration 064_razorpay_payment_links.sql.</p>
        ) : status.connected ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Using key <span className="font-mono">{status.key_id_masked}</span>
            </p>

            {reveal ? (
              <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-foreground">Finish setup in Razorpay (copy this now, the secret is shown only once)</p>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>Razorpay Dashboard → Account &amp; Settings → Webhooks → Add new webhook.</li>
                  <li>Paste the webhook URL and the secret below.</li>
                  <li>Tick: payment_link.paid, payment_link.expired, payment_link.cancelled, payment.failed. Save.</li>
                </ol>
                <CopyField label="Webhook URL" value={reveal.url} />
                <CopyField label="Webhook secret" value={reveal.secret} />
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setReveal(null)}>
                  I&apos;ve saved it in Razorpay
                </Button>
              </div>
            ) : (
              <CopyField label="Webhook URL (paste in Razorpay → Webhooks)" value={status.webhook_url} />
            )}

            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-xl" disabled={busy} onClick={() => void regenerate()}>
                  <RefreshCw className="mr-2 size-4" /> New webhook secret
                </Button>
                <Button type="button" variant="outline" className="rounded-xl text-red-600" disabled={busy} onClick={() => void disconnect()}>
                  <Unplug className="mr-2 size-4" /> Disconnect
                </Button>
              </div>
            )}
          </div>
        ) : isAdmin ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Razorpay Dashboard → Account &amp; Settings → API Keys → Generate key. Your secret is encrypted and never shown again.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rzp-key" className="text-xs font-semibold text-muted-foreground">Key ID</Label>
                <Input id="rzp-key" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_xxxxxxxx" autoComplete="off" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rzp-secret" className="text-xs font-semibold text-muted-foreground">Key Secret</Label>
                <Input id="rzp-secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="new-password" className="h-10 rounded-xl" />
              </div>
            </div>
            <Button type="button" className="rounded-xl" disabled={busy || !keyId || !keySecret} onClick={() => void connect()}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Connect &amp; test
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ask an admin to connect Razorpay.</p>
        )}
      </CardContent>
    </Card>
  );
}
