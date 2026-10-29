'use client';

// Platform admin controls for one partner (/admin/partners/[id]):
// approve / rate / code, credited businesses, commissions and payouts.
// All writes go to /api/admin/partners/[id]/…, then refresh the page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatInr, PARTNER_STATUS_LABELS, PARTNER_STATUSES } from '@/lib/partners/program';
import type { CommissionRow, PartnerRow, ReferralView } from '@/lib/partners/server';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const selectClass = 'border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm';

/** fetch + toast + refresh; returns the JSON on success, null on failure. */
function useAdminCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Something went wrong');
        return null;
      }
      if (success) toast.success(success);
      router.refresh();
      return json;
    } finally {
      setBusy(false);
    }
  }
  return { busy, call };
}

export function PartnerSettings({ partner }: { partner: PartnerRow }) {
  const { busy, call } = useAdminCall();
  const [status, setStatus] = useState<string>(partner.status);
  const [rate, setRate] = useState(String(partner.commission_rate));
  const [code, setCode] = useState(partner.code);
  const [note, setNote] = useState(partner.admin_note ?? '');

  const save = (overrides?: { status?: string }) =>
    call(
      `/api/admin/partners/${partner.id}`,
      'PATCH',
      { status: overrides?.status ?? status, commission_rate: Number(rate), code, admin_note: note },
      overrides?.status === 'approved' ? 'Approved — partner emailed' : 'Saved'
    );

  return (
    <section className="border-border space-y-4 rounded-2xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Settings</h2>
        {partner.status === 'pending' && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => save({ status: 'rejected' })}>
              Reject
            </Button>
            <Button size="sm" disabled={busy} onClick={() => save({ status: 'approved' })}>
              Approve
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ps-status" className="text-muted-foreground text-xs">Status</Label>
          <select id="ps-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
            {PARTNER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PARTNER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-rate" className="text-muted-foreground text-xs">Commission %</Label>
          <Input id="ps-rate" type="number" min="0" max="100" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ps-code" className="text-muted-foreground text-xs">Link code</Label>
          <Input id="ps-code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} maxLength={32} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ps-note" className="text-muted-foreground text-xs">Internal note (partner never sees it)</Label>
        <Input id="ps-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </div>
      <p className="text-muted-foreground text-xs">
        Changing the code breaks links already shared. A new rate applies to future payments only.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>
    </section>
  );
}

export function PayoutButton({
  partnerId,
  pending,
  defaultMethod,
  payoutDetails,
}: {
  partnerId: string;
  pending: number;
  defaultMethod: string | null;
  payoutDetails: string | null;
}) {
  const { busy, call } = useAdminCall();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(defaultMethod === 'bank' ? 'Bank transfer' : 'UPI');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  if (pending <= 0) return <p className="text-muted-foreground text-sm">Nothing owed right now.</p>;
  if (!open) {
    return <Button onClick={() => setOpen(true)}>Record payout of {formatInr(pending)}</Button>;
  }
  return (
    <div className="w-full space-y-3 sm:max-w-md">
      <p className="text-muted-foreground text-xs">
        Send {formatInr(pending)} to {payoutDetails ?? 'the partner (no payout details yet)'}, then record it here.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="UPI" />
        <Input aria-label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / reference" />
      </div>
      <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            const json = await call(`/api/admin/partners/${partnerId}/payouts`, 'POST', { method, reference, note });
            if (json) {
              toast.success(`Payout of ${json.label} recorded — partner emailed`);
              setOpen(false);
            }
          }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Mark {formatInr(pending)} paid
        </Button>
      </div>
    </div>
  );
}

export function ReferralsAdmin({ partnerId, referrals }: { partnerId: string; referrals: ReferralView[] }) {
  const { busy, call } = useAdminCall();
  const [account, setAccount] = useState('');

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-sm font-semibold">Businesses they brought</h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call(`/api/admin/partners/${partnerId}/referrals`, 'POST', { account }, 'Business credited')) setAccount('');
          }}
        >
          <Input
            aria-label="Account id or owner email"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Owner email or account id"
            className="sm:w-64"
          />
          <Button type="submit" variant="outline" disabled={busy || !account.trim()}>
            Credit
          </Button>
        </form>
      </div>
      {referrals.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">None yet.</p>
      ) : (
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">Business</th>
                <th className="px-4 py-2.5 font-medium">Credited</th>
                <th className="px-4 py-2.5 font-medium">How</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Commission</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.account_id} className="border-border border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/accounts/${r.account_id}`} prefetch={false} className="font-medium hover:underline">
                      {r.business}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{day(r.referred_at)}</td>
                  <td className="text-muted-foreground px-4 py-2.5">{r.source === 'link' ? 'Link' : 'Added by admin'}</td>
                  <td className="px-4 py-2.5">{r.plan}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(r.earned)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Remove ${r.business} from this partner? Commission already recorded stays.`)) {
                          void call(`/api/admin/partners/${partnerId}/referrals?account_id=${r.account_id}`, 'DELETE', undefined, 'Removed');
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function CommissionsAdmin({
  partnerId,
  commissions,
  referrals,
}: {
  partnerId: string;
  commissions: CommissionRow[];
  referrals: ReferralView[];
}) {
  const { busy, call } = useAdminCall();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const business = new Map(referrals.map((r) => [r.account_id, r.business]));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Commissions</h2>
      <form
        className="border-border grid gap-2 rounded-2xl border p-4 sm:grid-cols-[8rem_1fr_12rem_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await call(
            `/api/admin/partners/${partnerId}/commissions`,
            'POST',
            { amount: Number(amount), description, account_id: accountId || null },
            'Commission added'
          );
          if (ok) {
            setAmount('');
            setDescription('');
          }
        }}
      >
        <Input aria-label="Amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ amount" />
        <Input aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reason, e.g. bonus for 5 clients" />
        <select aria-label="Business" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectClass}>
          <option value="">No business</option>
          {referrals.map((r) => (
            <option key={r.account_id} value={r.account_id}>
              {r.business}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={busy || !(Number(amount) > 0)}>
          Add
        </Button>
      </form>
      {commissions.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">
          None yet. They are added when you save a referred account&rsquo;s plan with &ldquo;Amount received&rdquo;.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Business</th>
                <th className="px-4 py-2.5 font-medium">What</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className={`border-border border-b last:border-0 ${c.status === 'void' ? 'opacity-50' : ''}`}>
                  <td className="whitespace-nowrap px-4 py-2.5">{day(c.created_at)}</td>
                  <td className="px-4 py-2.5">{c.account_id ? business.get(c.account_id) ?? '—' : '—'}</td>
                  <td className="text-muted-foreground px-4 py-2.5">
                    {c.description}
                    {c.payment_amount ? ` (${c.rate}% of ${formatInr(c.payment_amount)})` : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(c.amount)}</td>
                  <td className="px-4 py-2.5">{c.status === 'pending' ? 'Owed' : c.status === 'paid' ? 'Paid' : 'Cancelled'}</td>
                  <td className="px-4 py-2.5 text-right">
                    {c.status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void call(
                            `/api/admin/partners/${partnerId}/commissions`,
                            'PATCH',
                            { commission_id: c.id, status: c.status === 'void' ? 'pending' : 'void' },
                            c.status === 'void' ? 'Restored' : 'Cancelled'
                          )
                        }
                      >
                        {c.status === 'void' ? 'Restore' : 'Cancel'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
