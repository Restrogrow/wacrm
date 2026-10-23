'use client';

// "Check catalog connection" on Orders & payments: asks Meta, via
// /api/whatsapp/commerce/diagnose, whether the number, account and catalog
// are linked the way product messages need. Read-only.

import { useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { SetupCheck } from '@/lib/catalog/meta-diagnose';

const ICON = {
  ok: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />,
  warn: <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />,
  fail: <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />,
};

export function CatalogCheck({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<SetupCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fixing, setFixing] = useState(false);

  async function enableCart() {
    setFixing(true);
    try {
      const res = await fetch('/api/whatsapp/commerce/enable-cart', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Could not turn them on');
      toast.success('Catalog and cart are on for this number');
      await run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not turn them on', { duration: 12_000 });
    } finally {
      setFixing(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp/commerce/diagnose', { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { checks?: SetupCheck[]; error?: string };
      if (!res.ok) throw new Error(json.error || 'Could not check');
      setChecks(json.checks ?? []);
    } catch (err) {
      setChecks(null);
      setError(err instanceof Error ? err.message : 'Could not check');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={disabled || busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
        Check catalog connection
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {checks && (
        <ul className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              {ICON[c.status]}
              <span className="min-w-0">
                <b className="font-medium">{c.label}:</b> <span className="break-words text-muted-foreground">{c.detail}</span>
                {c.fix === 'enable_catalog_cart' && (
                  <Button type="button" size="sm" className="mt-2 flex" onClick={enableCart} disabled={fixing}>
                    {fixing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Turn on catalog &amp; cart
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
