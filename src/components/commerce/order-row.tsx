'use client';

// One order with its payment + fulfilment badges and actions
// (change status — the customer is told — and mark paid). Used in
// Settings → Orders & payments and in the chat's order dialog.

import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NEXT_STATUSES, ORDER_STATUS_LABEL, rupees, type OrderItem, type OrderStatus, type PaymentStatus } from '@/lib/whatsapp/commerce-core';

export interface OrderRowData {
  id: string;
  reference_id: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_mode: string | null;
  source: 'agent' | 'catalog';
  created_at: string;
  contacts?: { name: string | null; phone: string | null } | null;
}

const PAYMENT: Record<PaymentStatus, { label: string; className: string }> = {
  unpaid: { label: 'Unpaid', className: 'bg-muted text-muted-foreground border-border' },
  requested: { label: 'Payment requested', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  pending: { label: 'Paying…', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  paid: { label: 'Paid', className: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/30' },
  failed: { label: 'Payment failed', className: 'bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30' },
  refunded: { label: 'Refunded', className: 'bg-muted text-muted-foreground border-border' },
};

export function OrderRow({ order, showCustomer, onChange }: { order: OrderRowData; showCustomer?: boolean; onChange: (o: OrderRowData) => void }) {
  const [busy, setBusy] = useState(false);
  const next = NEXT_STATUSES[order.status] ?? [];

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/whatsapp/commerce/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ?? 'Could not update the order.');
        return;
      }
      if (json.warning) toast.warning(json.warning);
      else toast.success(body.action === 'mark_paid' ? 'Marked as paid.' : 'Order updated — customer notified.');
      onChange({ ...order, ...json.order });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">
          {order.reference_id} · {rupees(order.total)}
          {showCustomer && order.contacts && (
            <span className="font-normal text-muted-foreground"> · {order.contacts.name || order.contacts.phone}</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} · {format(new Date(order.created_at), 'd MMM, h:mm a')}
          {order.source === 'catalog' ? ' · from catalog' : ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge className={`border text-[11px] ${PAYMENT[order.payment_status].className}`}>{PAYMENT[order.payment_status].label}</Badge>
          <Badge variant="outline" className="text-[11px]">
            {ORDER_STATUS_LABEL[order.status]}
          </Badge>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {order.payment_status !== 'paid' && order.status !== 'canceled' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void patch({ action: 'mark_paid' })}>
            <Check className="size-3.5" />
            Mark paid
          </Button>
        )}
        {next.length > 0 && (
          <Select value="" onValueChange={(v) => v && void patch({ action: 'status', status: v })}>
            <SelectTrigger className="h-8 w-36" disabled={busy}>
              <SelectValue placeholder="Update status" />
            </SelectTrigger>
            <SelectContent>
              {next.map((s) => (
                <SelectItem key={s} value={s}>
                  {ORDER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
