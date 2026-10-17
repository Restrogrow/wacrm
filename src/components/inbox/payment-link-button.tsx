'use client';

// Link icon in the chat header: "Request payment". Creates a Razorpay
// payment link for an amount (optionally tied to an order) and sends it in
// the chat. Shows the links already sent here with their status.
// API: /api/payments/razorpay/link, /api/payments/razorpay/settings.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Link2, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { rupees } from '@/lib/whatsapp/commerce-core';

interface SentLink {
  id: string;
  order_id: string | null;
  amount: number;
  description: string;
  short_url: string | null;
  status: 'created' | 'paid' | 'failed' | 'expired' | 'cancelled';
  paid_at: string | null;
  created_at: string;
}

interface UnpaidOrder {
  id: string;
  reference_id: string;
  total: number;
  payment_status: string;
}

const STATUS_STYLE: Record<SentLink['status'], { label: string; cls: string }> = {
  created: { label: 'Awaiting payment', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  paid: { label: 'Paid', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  failed: { label: 'Attempt failed', cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  expired: { label: 'Expired', cls: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground' },
};

export function PaymentLinkButton({ conversationId }: { conversationId: string }) {
  const { canSendMessages } = useAuth();
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [links, setLinks] = useState<SentLink[]>([]);
  const [orders, setOrders] = useState<UnpaidOrder[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);

  if (!canSendMessages) return null;

  async function openDialog() {
    setOpen(true);
    const [s, l, o] = await Promise.all([
      fetch('/api/payments/razorpay/settings').then((r) => r.json()).catch(() => null),
      fetch(`/api/payments/razorpay/link?conversation_id=${conversationId}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/whatsapp/commerce/orders?conversation_id=${conversationId}`).then((r) => r.json()).catch(() => null),
    ]);
    setConnected(!!s?.connected);
    setLinks(l?.links ?? []);
    setOrders(((o?.orders ?? []) as UnpaidOrder[]).filter((x) => x.payment_status !== 'paid'));
  }

  function pickOrder(id: string) {
    setOrderId(id);
    const order = orders.find((x) => x.id === id);
    if (order) {
      setAmount(String(order.total / 100));
      if (!description) setDescription(`Order ${order.reference_id}`);
    }
  }

  async function send() {
    setBusy(true);
    try {
      const res = await fetch('/api/payments/razorpay/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          amount: amount || undefined,
          description,
          order_id: orderId || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? 'Could not send the payment link.');
        return;
      }
      toast.success('Payment link sent.');
      if (j.link) setLinks((list) => [j.link, ...list]);
      setAmount('');
      setDescription('');
      setOrderId('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        aria-label="Request payment"
        title="Request payment (Razorpay link)"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="bg-popover border-border max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Request payment</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Sends a secure Razorpay link in this chat. Works within 24 hours of the customer&apos;s last message.
            </DialogDescription>
          </DialogHeader>

          {connected === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !connected ? (
            <p className="rounded-xl border border-border bg-card-2 p-4 text-sm text-muted-foreground">
              Razorpay isn&apos;t connected yet. An admin can connect it in{' '}
              <Link href="/orders" className="font-semibold text-primary underline-offset-4 hover:underline">
                Orders &amp; payments
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {orders.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="pl-order" className="text-xs font-semibold text-muted-foreground">For an order (optional)</Label>
                  <select
                    id="pl-order"
                    value={orderId}
                    onChange={(e) => pickOrder(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  >
                    <option value="">No order</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.reference_id} — {rupees(o.total)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="pl-amount" className="text-xs font-semibold text-muted-foreground">Amount (₹)</Label>
                  <Input id="pl-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1499" className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-desc" className="text-xs font-semibold text-muted-foreground">What is it for?</Label>
                  <Input id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Advance for booking" className="h-10 rounded-xl" />
                </div>
              </div>
              <Button type="button" className="w-full rounded-xl" disabled={busy || (!amount && !orderId)} onClick={() => void send()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Send payment link
              </Button>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Sent in this chat</p>
              {links.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{rupees(l.amount)}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[l.status].cls)}>
                    {STATUS_STYLE[l.status].label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
