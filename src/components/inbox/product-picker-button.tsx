'use client';

// Shopping-bag button in the inbox composer: search the product library and
//   • share one product,
//   • send several as a WhatsApp multi-product list,
//   • send a saved collection ("Best sellers") in one click,
//   • or create an order / payment request from the selection.
// API: /api/catalog/picker, /api/catalog/collections, /api/whatsapp/commerce/share,
//      /api/whatsapp/commerce/orders.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Minus, Plus, Search, ShoppingBag, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { formatPrice } from '@/lib/catalog/core';
import { cn } from '@/lib/utils';

interface PickerProduct {
  id: string;
  retailer_id: string;
  title: string;
  price_paise: number;
  sale_price_paise: number | null;
  currency: string;
  image_url: string | null;
  availability: string;
  stock_qty: number | null;
  category: string | null;
}

interface Collection {
  id: string;
  name: string;
  retailer_ids: string[];
}

type Tab = 'products' | 'collections';

const unitPaise = (p: PickerProduct) => p.sale_price_paise ?? p.price_paise;
const isOut = (p: PickerProduct) => p.availability === 'out of stock' || (p.stock_qty !== null && p.stock_qty <= 0);

export function ProductPickerButton({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  const { canSendMessages } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('products');
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, PickerProduct>>(new Map());
  const [qty, setQty] = useState<Record<string, number>>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const loadProducts = useCallback(async (term: string) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/catalog/picker?q=${encodeURIComponent(term)}&limit=30`, { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (mine !== seq.current) return;
      setProducts((body?.products ?? []) as PickerProduct[]);
      setReady(body?.ready !== false);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const loadCollections = useCallback(async () => {
    const res = await fetch('/api/catalog/collections', { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    setCollections((body?.collections ?? []) as Collection[]);
  }, []);

  // Debounced search while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void loadProducts(q), 250);
    return () => clearTimeout(t);
  }, [open, q, loadProducts]);

  useEffect(() => {
    if (open) void loadCollections();
  }, [open, loadCollections]);

  const chosen = useMemo(() => [...selected.values()], [selected]);
  const currencies = new Set(chosen.map((p) => p.currency));

  if (!canSendMessages) return null;

  function toggle(p: PickerProduct) {
    if (isOut(p) && !selected.has(p.retailer_id)) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.retailer_id)) next.delete(p.retailer_id);
      else if (next.size < 30) next.set(p.retailer_id, p);
      else toast.error('WhatsApp allows up to 30 products in one message.');
      return next;
    });
  }

  function reset() {
    setSelected(new Map());
    setQty({});
    setMessage('');
    setEditing(null);
    setCollectionName('');
  }

  async function post(url: string, payload: unknown, method = 'POST') {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Something went wrong.');
      return body;
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      const ids = chosen.map((p) => p.retailer_id);
      const res = await post('/api/whatsapp/commerce/share', {
        conversation_id: conversationId,
        ...(ids.length === 1 ? { kind: 'product', retailer_id: ids[0] } : { kind: 'product_list', retailer_ids: ids }),
        text: message.trim() || undefined,
      });
      toast.success(ids.length === 1 ? 'Product sent' : res?.mode === 'links' ? `${ids.length} products sent` : 'Product list sent');
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    }
  }

  async function sendCollection(c: Collection) {
    try {
      await post('/api/whatsapp/commerce/share', { conversation_id: conversationId, kind: 'product_list', collection_id: c.id, text: message.trim() || undefined });
      toast.success(`“${c.name}” sent`);
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send.');
    }
  }

  async function sendOrder() {
    if (currencies.size > 1 || (chosen[0] && chosen[0].currency !== 'INR')) {
      toast.error('Orders are in INR. Pick products priced in INR only.');
      return;
    }
    try {
      await post('/api/whatsapp/commerce/orders', {
        conversation_id: conversationId,
        items: chosen.map((p) => ({
          name: p.title.slice(0, 60),
          quantity: Math.max(1, qty[p.retailer_id] ?? 1),
          price: (unitPaise(p) / 100).toFixed(2),
          retailer_id: p.retailer_id,
        })),
        message: message.trim() || undefined,
      });
      toast.success('Order request sent');
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the order.');
    }
  }

  async function saveCollection() {
    try {
      const payload = { name: collectionName, retailer_ids: chosen.map((p) => p.retailer_id) };
      if (editing) await post(`/api/catalog/collections/${editing.id}`, payload, 'PATCH');
      else await post('/api/catalog/collections', payload);
      toast.success(editing ? 'Collection updated' : 'Collection saved');
      setEditing(null);
      setCollectionName('');
      await loadCollections();
      setTab('collections');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  }

  async function removeCollection(c: Collection) {
    if (!window.confirm(`Delete the collection “${c.name}”?`)) return;
    try {
      await post(`/api/catalog/collections/${c.id}`, {}, 'DELETE');
      await loadCollections();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete.');
    }
  }

  function editCollection(c: Collection) {
    const m = new Map<string, PickerProduct>();
    for (const rid of c.retailer_ids) {
      const known = products.find((p) => p.retailer_id === rid);
      m.set(
        rid,
        known ?? { id: rid, retailer_id: rid, title: rid, price_paise: 0, sale_price_paise: null, currency: 'INR', image_url: null, availability: 'in stock', stock_qty: null, category: null },
      );
    }
    setSelected(m);
    setEditing(c);
    setCollectionName(c.name);
    setTab('products');
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Share products"
        aria-label="Share products"
        className="text-muted-foreground hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
      >
        <ShoppingBag className="h-4 w-4" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Share products</DialogTitle>
            <DialogDescription>Pick products to share, send a saved collection, or turn your picks into an order.</DialogDescription>
          </DialogHeader>

          <div className="bg-muted flex rounded-lg p-0.5 text-sm font-semibold">
            {(['products', 'collections'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn('flex-1 rounded-md px-3 py-1.5 capitalize', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                {t}
                {t === 'collections' && collections.length > 0 ? ` (${collections.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'products' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" className="pl-9" />
              </div>

              {!ready ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">The product library isn&apos;t set up yet.</p>
              ) : loading && products.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              ) : products.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  {q ? 'No products match.' : 'No products yet. Add some on the Catalog page, or sync them from your store.'}
                </p>
              ) : (
                <ul className="min-h-24 flex-1 divide-y overflow-y-auto rounded-lg border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {products.map((p) => {
                    const on = selected.has(p.retailer_id);
                    const out = isOut(p);
                    return (
                      <li key={p.id}>
                        <label className={cn('flex cursor-pointer items-center gap-3 p-2.5', out && !on && 'cursor-not-allowed opacity-50')}>
                          <input type="checkbox" checked={on} disabled={out && !on} onChange={() => toggle(p)} />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.image_url ? <img src={p.image_url} alt="" className="size-10 shrink-0 rounded-md border object-cover" /> : <div className="bg-muted size-10 shrink-0 rounded-md" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.title}</span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {p.retailer_id} · {formatPrice(unitPaise(p), p.currency)}
                              {p.sale_price_paise !== null ? ' (sale)' : ''}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              out ? 'bg-red-500/15 text-red-700 dark:text-red-400' : p.stock_qty !== null && p.stock_qty <= 5 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                            )}
                          >
                            {out ? 'Out of stock' : p.stock_qty !== null ? `${p.stock_qty} left` : 'In stock'}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {chosen.length > 0 && (
                <div className="shrink-0 space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">
                    {chosen.length} selected
                    <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground ml-2 text-xs font-normal underline">
                      clear
                    </button>
                  </p>
                  <ul className="max-h-24 space-y-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {chosen.map((p) => (
                      <li key={p.retailer_id} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                        <span className="flex items-center gap-1">
                          <button type="button" className="rounded border p-0.5" onClick={() => setQty((s) => ({ ...s, [p.retailer_id]: Math.max(1, (s[p.retailer_id] ?? 1) - 1) }))} aria-label="Less">
                            <Minus className="size-3" />
                          </button>
                          <span className="w-6 text-center">{qty[p.retailer_id] ?? 1}</span>
                          <button type="button" className="rounded border p-0.5" onClick={() => setQty((s) => ({ ...s, [p.retailer_id]: Math.min(1000, (s[p.retailer_id] ?? 1) + 1) }))} aria-label="More">
                            <Plus className="size-3" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message to go with it" maxLength={1000} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={share}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : chosen.length === 1 ? 'Share product' : `Send as list (${chosen.length})`}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={sendOrder}>
                      Send as order request
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 border-t pt-3">
                    <Input value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="Save these as a collection…" maxLength={24} />
                    <Button size="sm" variant="outline" disabled={busy || !collectionName.trim()} onClick={saveCollection}>
                      {editing ? 'Update' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'collections' && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional message to go with it" maxLength={1000} />
              {collections.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  No collections yet. Select products on the Products tab and save them with a name like “Best sellers”.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {collections.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 p-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="text-muted-foreground text-xs">{c.retailer_ids.length} products</span>
                      </span>
                      <Button size="sm" disabled={busy} onClick={() => sendCollection(c)}>
                        Send
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => editCollection(c)}>
                        Edit
                      </Button>
                      <button type="button" onClick={() => removeCollection(c)} className="text-muted-foreground hover:text-red-600" aria-label={`Delete ${c.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
