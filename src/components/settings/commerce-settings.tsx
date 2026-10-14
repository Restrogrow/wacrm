'use client';

// ============================================================
// Settings → Orders & payments
//
// Catalog ID (share products, receive catalog orders) and how customers
// pay: WhatsApp Pay (payment configuration set up in WhatsApp Manager
// with Razorpay / PayU / BillDesk / Zaakpay) or your UPI ID. Below,
// recent orders with payment / status controls.
// API: /api/whatsapp/commerce/settings, /api/whatsapp/commerce/orders.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { OrderRow, type OrderRowData } from '@/components/commerce/order-row';
import { SettingsPanelHead } from './settings-panel-head';

interface Settings {
  catalog_id: string;
  payment_mode: 'none' | 'whatsapp_pay' | 'upi_id';
  payment_configuration: string;
  payment_gateway: string;
  upi_id: string;
  upi_name: string;
  goods_type: 'physical-goods' | 'digital-goods';
}

const EMPTY: Settings = {
  catalog_id: '',
  payment_mode: 'none',
  payment_configuration: '',
  payment_gateway: 'razorpay',
  upi_id: '',
  upi_name: '',
  goods_type: 'physical-goods',
};

const MODES: { value: Settings['payment_mode']; title: string; text: string }[] = [
  {
    value: 'whatsapp_pay',
    title: 'WhatsApp Pay',
    text: 'Customers tap “Review and pay” and pay by UPI, card or netbanking inside WhatsApp. Payments are confirmed automatically.',
  },
  { value: 'upi_id', title: 'UPI ID', text: 'We send the order summary with your UPI ID. You mark it paid when the money arrives.' },
  { value: 'none', title: 'Off', text: 'No payment requests from the inbox.' },
];

export function CommerceSettings() {
  const { canEditSettings } = useAuth();
  const [form, setForm] = useState<Settings>(EMPTY);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<OrderRowData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/whatsapp/commerce/settings')
      .then((r) => r.json())
      .catch(() => null)
      .then((body) => {
        if (cancelled) return;
        setAvailable(body?.available !== false);
        if (body?.settings) {
          const s = body.settings;
          setForm({
            catalog_id: s.catalog_id ?? '',
            payment_mode: s.payment_mode ?? 'none',
            payment_configuration: s.payment_configuration ?? '',
            payment_gateway: s.payment_gateway ?? 'razorpay',
            upi_id: s.upi_id ?? '',
            upi_name: s.upi_name ?? '',
            goods_type: s.goods_type ?? 'physical-goods',
          });
        }
      });
    fetch('/api/whatsapp/commerce/orders?limit=50')
      .then((r) => r.json())
      .catch(() => null)
      .then((body) => !cancelled && setOrders(body?.orders ?? []));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/commerce/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not save.');
        return;
      }
      toast.success('Saved.');
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canEditSettings || saving;

  return (
    <section className="space-y-6">
      <SettingsPanelHead
        title="Orders & payments"
        description="Send orders with a payment request from any chat, share your catalog, and track payment and delivery. Use the ₹ icon in a chat."
      />

      {available === false ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Run migration 053_orders_and_payments.sql to use orders and payments.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <Label>How customers pay</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setForm({ ...form, payment_mode: m.value })}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
                      form.payment_mode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{m.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.text}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.payment_mode === 'whatsapp_pay' && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  First, in <b>WhatsApp Manager → Account tools → Payment configurations</b>, connect your Razorpay, PayU,
                  BillDesk or Zaakpay account and name the configuration. Then enter that name here.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Payment gateway</Label>
                    <Select value={form.payment_gateway} onValueChange={(v) => v && setForm({ ...form, payment_gateway: v })} disabled={disabled}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="razorpay">Razorpay</SelectItem>
                        <SelectItem value="payu">PayU</SelectItem>
                        <SelectItem value="billdesk">BillDesk</SelectItem>
                        <SelectItem value="zaakpay">Zaakpay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Configuration name</Label>
                    <Input value={form.payment_configuration} onChange={(e) => setForm({ ...form, payment_configuration: e.target.value })} disabled={disabled} placeholder="my-razorpay" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>You sell</Label>
                    <Select value={form.goods_type} onValueChange={(v) => v && setForm({ ...form, goods_type: v as Settings['goods_type'] })} disabled={disabled}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="physical-goods">Physical products</SelectItem>
                        <SelectItem value="digital-goods">Services / digital</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {form.payment_mode === 'upi_id' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>UPI ID</Label>
                  <Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} disabled={disabled} placeholder="yourshop@okaxis" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name on the account (optional)</Label>
                  <Input value={form.upi_name} onChange={(e) => setForm({ ...form, upi_name: e.target.value })} disabled={disabled} placeholder="Priya Stores" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>WhatsApp catalog ID (optional)</Label>
              <Input value={form.catalog_id} onChange={(e) => setForm({ ...form, catalog_id: e.target.value })} disabled={disabled} placeholder="e.g. 1234567890123456" />
              <p className="text-xs text-muted-foreground">
                From Commerce Manager, connected to your WhatsApp number in WhatsApp Manager → Catalog. Lets you share products
                and receive orders customers place from your catalog.
              </p>
            </div>

            {canEditSettings && (
              <Button onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-foreground">Recent orders</h3>
          {!orders ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No orders yet. Create one from a chat with the ₹ icon.</p>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((o) => (
                <OrderRow key={o.id} order={o} showCustomer onChange={(u) => setOrders((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
