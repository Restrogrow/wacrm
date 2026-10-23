'use client';

// Starts the one-click WooCommerce connection: asks Repeat Grow for the
// store's approval URL, then sends the browser there.

import { useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function WooConnectButton({ storeUrl, label = 'Connect in one click', className }: { storeUrl: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/woocommerce/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_url: storeUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { authorize_url?: string; error?: string };
      if (!res.ok || !json.authorize_url) throw new Error(json.error || 'Could not start the connection');
      window.location.assign(json.authorize_url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the connection', { duration: 12_000, closeButton: true });
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={go} disabled={busy || !storeUrl.trim()} className={className}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ShoppingCart className="size-4" />}
      {label}
    </Button>
  );
}
