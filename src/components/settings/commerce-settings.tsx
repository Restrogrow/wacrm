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

import { IconChip } from '@/components/icon-chip';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Clock, IndianRupee, Loader2, Package, Save, ShoppingBag, Smartphone, Wallet, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { rupees } from '@/lib/whatsapp/commerce-core';
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

const MODES: { value: Settings['payment_mode']; title: string; text: string; icon: LucideIcon }[] = [
  {
    value: 'whatsapp_pay',
    title: 'WhatsApp Pay',
    icon: Wallet,
    text: 'Customers tap “Review and pay” and pay by UPI, card or netbanking inside WhatsApp. Payments are confirmed automatically.',
  },
  { value: 'upi_id', icon: Smartphone, title: 'UPI ID', text: 'We send the order summary with your UPI ID. You mark it paid when the money arrives.' },
  { value: 'none', icon: Ban, title: 'Off', text: 'No payment requests from the inbox.' },
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

  const paidTotal = (orders ?? [])
    .filter((o) => o.payment_status === 'paid')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const awaiting = (orders ?? []).filter(
    (o) => ['unpaid', 'requested', 'pending'].includes(o.payment_status) && o.status !== 'canceled',
  ).length;
  const modeLabel = MODES.find((m) => m.value === form.payment_mode)?.title ?? 'Off';

  const stats: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
    { label: 'Orders', value: orders ? String(orders.length) : '—', icon: Package, tone: 'bg-primary text-primary-foreground shadow-primary/30' },
    { label: 'Payments collected', value: orders ? rupees(paidTotal) : '—', icon: IndianRupee, tone: 'bg-sky-500 text-white shadow-sky-500/30' },
    { label: 'Awaiting payment', value: orders ? String(awaiting) : '—', icon: Clock, tone: 'bg-amber-500 text-white shadow-amber-500/30' },
    { label: 'Payment method', value: modeLabel, icon: Wallet, tone: 'bg-violet-500 text-white shadow-violet-500/30' },
  ];

  return (
    <section className="space-y-6">
      <SettingsPanelHead
        icon={IndianRupee}
        title="Orders & payments"
        description="Send orders with a payment request from any chat, share your catalog, and track payment and delivery. Use the ₹ icon in a chat."
        action={
          canEditSettings && available !== false ? (
            <Button onClick={() => void save()} disabled={saving} className="rounded-xl shadow-md shadow-primary/25">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          ) : undefined
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((st) => (
          <div key={st.label} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <span className={cn('flex size-11 items-center justify-center rounded-2xl shadow-lg', st.tone)}>
              <st.icon className="size-5" />
            </span>
            <p className="mt-4 truncate text-2xl leading-none font-bold tracking-tight text-foreground tabular-nums">{st.value}</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{st.label}</p>
          </div>
        ))}
      </div>

      {available === false ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Run migration 053_orders_and_payments.sql to use orders and payments.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          {/* Payment setup */}
          <Card className="xl:col-span-3">
            <CardContent className="space-y-5">
              <div>
                <h3 className="text-base font-bold tracking-tight text-foreground">How customers pay</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Choose the payment request customers get with an order.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {MODES.map((m) => {
                  const active = form.payment_mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setForm({ ...form, payment_mode: m.value })}
                      className={cn(
                        'relative rounded-2xl border-2 p-4 text-left transition-all disabled:opacity-60',
                        active ? 'border-primary bg-primary-soft shadow-sm' : 'border-border bg-card hover:border-primary-soft-2 hover:bg-card-2',
                      )}
                    >
                      <span className={cn('flex size-10 items-center justify-center rounded-xl', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        <m.icon className="size-5" />
                      </span>
                      <p className="mt-3 text-sm font-bold text-foreground">{m.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.text}</p>
                    </button>
                  );
                })}
              </div>

              {form.payment_mode === 'whatsapp_pay' && (
                <div className="space-y-4 rounded-2xl border border-primary-soft-2 bg-primary-soft/40 p-4">
                  <p className="text-xs leading-relaxed text-muted-foreground">
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
                <div className="grid gap-3 rounded-2xl border border-primary-soft-2 bg-primary-soft/40 p-4 sm:grid-cols-2">
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
            </CardContent>
          </Card>

          {/* Catalog */}
          <Card className="xl:col-span-2">
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <IconChip icon={ShoppingBag} className="size-11 rounded-2xl" />
                <div>
                  <h3 className="text-base font-bold tracking-tight text-foreground">Product catalog</h3>
                  <p className="text-xs text-muted-foreground">Optional — share products and receive catalog orders.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp catalog ID</Label>
                <Input value={form.catalog_id} onChange={(e) => setForm({ ...form, catalog_id: e.target.value })} disabled={disabled} placeholder="e.g. 1234567890123456" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  From Commerce Manager, connected to your WhatsApp number in WhatsApp Manager → Catalog. Lets you share products
                  and receive orders customers place from your catalog.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent orders */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip icon={Package} className="size-11 rounded-2xl" />
              <div>
                <h3 className="text-base font-bold tracking-tight text-foreground">Recent orders</h3>
                <p className="text-xs text-muted-foreground">Track payment and delivery — customers are notified on updates.</p>
              </div>
            </div>
            {orders && orders.length > 0 && (
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{orders.length} orders</span>
            )}
          </div>
          {!orders ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-primary-soft-2 bg-primary-soft/40 px-4 py-12 text-center">
              <IconChip icon={Package} className="size-14 rounded-3xl" />
              <p className="text-base font-bold text-foreground">No orders yet</p>
              <p className="text-sm text-muted-foreground">Create one from any chat with the ₹ icon.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {orders.map((o) => (
                <div key={o.id} className="rounded-2xl border border-border bg-card-2 px-4 transition-colors hover:border-primary-soft-2">
                  <OrderRow order={o} showCustomer onChange={(u) => setOrders((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
