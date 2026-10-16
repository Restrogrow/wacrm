'use client';

// ₹ icon in the chat header: create an order with a payment request,
// share the catalog or a product, and manage this customer's orders.
// API: /api/whatsapp/commerce/*.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { IndianRupee, Loader2, Plus, Send, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { rupees, toPaise } from '@/lib/whatsapp/commerce-core';
import { OrderRow, type OrderRowData } from '@/components/commerce/order-row';

interface ItemDraft {
  name: string;
  quantity: string;
  price: string;
  retailer_id: string;
}

type Tab = 'order' | 'share' | 'orders';

const emptyItem = (): ItemDraft => ({ name: '', quantity: '1', price: '', retailer_id: '' });

export function OrderButton({ conversationId }: { conversationId: string }) {
  const { canSendMessages } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('order');
  const [settings, setSettings] = useState<{ payment_mode: string; catalog_id: string | null } | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);
  const [tax, setTax] = useState('');
  const [shipping, setShipping] = useState('');
  const [discount, setDiscount] = useState('');
  const [message, setMessage] = useState('');
  const [shareText, setShareText] = useState('Browse our catalog and order right here on WhatsApp.');
  const [retailerId, setRetailerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<OrderRowData[] | null>(null);

  const total = useMemo(() => {
    const sub = items.reduce((s, i) => s + (toPaise(i.price) || 0) * (Number(i.quantity) || 0), 0);
    return sub + (toPaise(tax) || 0) + (toPaise(shipping) || 0) - (toPaise(discount) || 0);
  }, [items, tax, shipping, discount]);

  if (!canSendMessages) return null;

  async function openDialog() {
    setOpen(true);
    const [s, o] = await Promise.all([
      fetch('/api/whatsapp/commerce/settings').then((r) => r.json()).catch(() => null),
      fetch(`/api/whatsapp/commerce/orders?conversation_id=${conversationId}`).then((r) => r.json()).catch(() => null),
    ]);
    setSettings(s?.settings ?? { payment_mode: 'none', catalog_id: null });
    setOrders(o?.orders ?? []);
  }

  async function sendOrder() {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/commerce/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          items: items.map((i) => ({ name: i.name, quantity: Number(i.quantity), price: i.price, retailer_id: i.retailer_id || undefined })),
          tax,
          shipping,
          discount,
          message,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not send the order.');
        return;
      }
      toast.success('Order sent with a payment request.');
      setItems([emptyItem()]);
      setTax('');
      setShipping('');
      setDiscount('');
      setMessage('');
      if (body.order) setOrders((list) => [body.order, ...(list ?? [])]);
      setTab('orders');
    } finally {
      setBusy(false);
    }
  }

  async function share(kind: 'catalog' | 'product') {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/commerce/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, kind, retailer_id: retailerId, text: shareText }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not send.');
        return;
      }
      toast.success(kind === 'catalog' ? 'Catalog shared.' : 'Product shared.');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const noPayments = settings?.payment_mode === 'none';

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        aria-label="Orders and payments"
        title="Orders and payments"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <IndianRupee className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Orders & payments</DialogTitle>
            <DialogDescription className="text-muted-foreground">Works within 24 hours of the customer’s last message.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 rounded-xl bg-muted p-1 text-sm">
            {(
              [
                ['order', 'New order'],
                ['share', 'Share catalog'],
                ['orders', `Orders${orders?.length ? ` (${orders.length})` : ''}`],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn('flex-1 rounded-lg px-3 py-1.5 transition-colors', tab === t ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}
              >
                {label}
              </button>
            ))}
          </div>

          {!settings ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : tab === 'order' ? (
            noPayments ? (
              <p className="text-sm text-muted-foreground">
                Choose how customers pay first in{' '}
                <Link href="/orders" className="font-medium underline underline-offset-4">
                  Settings → Orders & payments
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_64px_96px_auto] gap-2">
                    <Input value={item.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Item" maxLength={60} />
                    <Input value={item.quantity} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} inputMode="numeric" aria-label="Quantity" />
                    <Input value={item.price} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} placeholder="₹ price" inputMode="decimal" />
                    <Button variant="ghost" size="icon" aria-label="Remove item" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems([...items, emptyItem()])}>
                  <Plus className="size-4" />
                  Add item
                </Button>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tax ₹</Label>
                    <Input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Shipping ₹</Label>
                    <Input value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Discount ₹</Label>
                    <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
                  </div>
                </div>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Message (optional)" />
                <div className="flex items-center justify-between">
                  <p className="text-sm">
                    Total <b>{rupees(Math.max(total, 0))}</b>
                    <span className="ml-2 text-xs text-muted-foreground">
                      via {settings.payment_mode === 'whatsapp_pay' ? 'WhatsApp Pay' : 'UPI ID'}
                    </span>
                  </p>
                  <Button onClick={() => void sendOrder()} disabled={busy || total <= 0}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send payment request
                  </Button>
                </div>
              </div>
            )
          ) : tab === 'share' ? (
            !settings.catalog_id ? (
              <p className="text-sm text-muted-foreground">
                Add your catalog ID in{' '}
                <Link href="/orders" className="font-medium underline underline-offset-4">
                  Settings → Orders & payments
                </Link>{' '}
                to share products.
              </p>
            ) : (
              <div className="space-y-3">
                <Textarea value={shareText} onChange={(e) => setShareText(e.target.value)} rows={2} />
                <Input value={retailerId} onChange={(e) => setRetailerId(e.target.value)} placeholder="Product content ID / SKU (for one product, optional)" />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => void share('product')} disabled={busy || !retailerId.trim()}>
                    Send this product
                  </Button>
                  <Button onClick={() => void share('catalog')} disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Share catalog
                  </Button>
                </div>
              </div>
            )
          ) : !orders || orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders with this customer yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} onChange={(u) => setOrders((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
