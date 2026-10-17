'use client';

// "Sync from store" button for the Catalog page: pulls products from the
// connected Shopify or WooCommerce store into the product library (one row
// per variant, up to 2,000). Shopify works with or without product access
// (the public product feed is the fallback and has no stock counts).
// WooCommerce needs the OPTIONAL REST API keys (Integrations → WooCommerce).
// API: /api/catalog/sync.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';

interface Status {
  shopify: { connected: boolean; domain?: string; has_admin_access?: boolean };
  woocommerce: { connected: boolean; url?: string; has_api_keys?: boolean };
  counts: Record<string, number>;
}

interface SyncResponse {
  error?: string;
  mode?: string;
  fetched?: number;
  created?: number;
  updated?: number;
  over_limit?: number;
  truncated?: boolean;
  note?: string;
}

export function StoreSyncMenu({ onDone }: { onDone?: () => void }) {
  const canAdmin = useCan('edit-settings');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<null | 'shopify' | 'woocommerce'>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/catalog/sync', { cache: 'no-store' });
    if (res.ok) setStatus((await res.json()) as Status);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(source: 'shopify' | 'woocommerce') {
    setBusy(source);
    try {
      const res = await fetch('/api/catalog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const body = (await res.json().catch(() => ({}))) as SyncResponse;
      if (!res.ok) throw new Error(body.error || 'Sync failed.');
      const parts = [`${body.created ?? 0} added`, `${body.updated ?? 0} updated`];
      if (body.over_limit) parts.push(`${body.over_limit} skipped (plan limit)`);
      if (body.truncated) parts.push('first 2,000 only');
      toast.success(`Synced from ${source === 'shopify' ? 'Shopify' : 'WooCommerce'}: ${parts.join(', ')}`);
      if (body.note) toast.message(body.note);
      setOpen(false);
      await load();
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setBusy(null);
    }
  }

  const none = status && !status.shopify.connected && !status.woocommerce.connected;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'border-border hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors',
        )}
      >
        <RefreshCw className="size-3.5" /> Sync from store
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        {!status ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </p>
        ) : none ? (
          <p className="text-muted-foreground text-xs">
            Connect Shopify or WooCommerce first under{' '}
            <Link href="/integrations" className="text-primary underline">
              Integrations
            </Link>
            , then come back to import your products.
          </p>
        ) : (
          <>
            {status.shopify.connected && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Shopify</p>
                <p className="text-muted-foreground text-xs">
                  {status.shopify.domain} · {status.counts.shopify ?? 0} products in your library
                  {status.shopify.has_admin_access ? '' : ' · uses the public product feed (no stock counts)'}
                </p>
                <Button size="sm" variant="outline" disabled={!canAdmin || busy !== null} onClick={() => run('shopify')}>
                  {busy === 'shopify' ? <Loader2 className="size-3.5 animate-spin" /> : 'Sync products from Shopify'}
                </Button>
              </div>
            )}
            {status.woocommerce.connected && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">WooCommerce</p>
                <p className="text-muted-foreground text-xs">
                  {status.woocommerce.url} · {status.counts.woocommerce ?? 0} products in your library
                </p>
                {status.woocommerce.has_api_keys ? (
                  <Button size="sm" variant="outline" disabled={!canAdmin || busy !== null} onClick={() => run('woocommerce')}>
                    {busy === 'woocommerce' ? <Loader2 className="size-3.5 animate-spin" /> : 'Sync products from WooCommerce'}
                  </Button>
                ) : (
                  <p className="text-xs">
                    Add your WooCommerce REST API keys (optional) on the{' '}
                    <Link href="/integrations/woocommerce" className="text-primary underline">
                      WooCommerce page
                    </Link>{' '}
                    to import products.
                  </p>
                )}
              </div>
            )}
            {!canAdmin && <p className="text-muted-foreground text-xs">Only admins can sync products.</p>}
            <p className="text-muted-foreground border-t pt-2 text-[11px]">
              One product per variant, up to 2,000. Existing products keep their SKU; prices, photos and stock are refreshed.
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
