'use client';

// Optional card on Integrations → WooCommerce: REST API keys that let Repeat
// Grow import your products into the catalog. Order messages work without
// them. Keys are checked against your store, stored encrypted and never
// shown again. API: /api/integrations/woocommerce/api-keys.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WooApiKeysCard({ connected, readOnly }: { connected: boolean; readOnly: boolean }) {
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/integrations/woocommerce/api-keys', { cache: 'no-store' });
    if (res.ok) setHasKeys(!!(await res.json()).has_keys);
    else setHasKeys(null);
  }, []);

  useEffect(() => {
    if (connected && !readOnly) void load();
  }, [connected, readOnly, load]);

  if (!connected || readOnly) return null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/woocommerce/api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save the keys.');
      toast.success('Keys saved. You can now sync products from the Catalog page.');
      setKey('');
      setSecret('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the keys.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/woocommerce/api-keys', { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not remove the keys.');
      toast.success('Keys removed');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the keys.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border bg-card rounded-3xl border p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <KeyRound className="text-primary mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight">Product import (optional)</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Only needed to import your WooCommerce products into the Catalog. Order messages work without it. In WooCommerce go to
            Settings → Advanced → REST API → Add key, give it <strong>Read</strong> access, and paste the two keys here.
          </p>
        </div>
      </div>

      {hasKeys ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <span>API keys are saved. Use “Sync from store” on the Catalog page.</span>
          <Button variant="outline" size="sm" onClick={remove} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Remove keys'}
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="woo-ck">Consumer key</Label>
            <Input id="woo-ck" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ck_…" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="woo-cs">Consumer secret</Label>
            <Input id="woo-cs" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="cs_…" autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <Button size="sm" onClick={save} disabled={busy || !key || !secret}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Test and save keys'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
