import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  CommissionsAdmin,
  PartnerSettings,
  PayoutButton,
  ReferralsAdmin,
} from '@/components/admin/partner-admin';
import { publicOrigin } from '@/lib/public-origin';
import { formatInr } from '@/lib/partners/program';
import { getPartner, loadPartnerLedger } from '@/lib/partners/server';

export const metadata: Metadata = {
  title: 'Partner',
};

export const dynamic = 'force-dynamic';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-muted-foreground w-40 shrink-0 text-xs sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export default async function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const partner = await getPartner(id);
  if (!partner) notFound();
  const ledger = await loadPartnerLedger(id);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <Link href="/admin/partners" prefetch={false} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-3.5" />
          Partners
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{partner.name}</h1>
        <p className="text-muted-foreground text-sm">
          Applied {day(partner.created_at)}
          {partner.approved_at ? ` · approved ${day(partner.approved_at)}` : ''} · {partner.clicks} link opens
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-border space-y-3 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">Application</h2>
          <dl className="space-y-2.5">
            <Row label="Email">{partner.email ?? '—'}</Row>
            <Row label="Phone / WhatsApp">
              {partner.phone ? (
                <a className="text-primary hover:underline" href={`https://wa.me/${partner.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                  {partner.phone}
                </a>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Company">{partner.company ?? '—'}</Row>
            <Row label="Website">{partner.website ?? '—'}</Row>
            <Row label="How they find clients">{partner.pitch ?? '—'}</Row>
            <Row label="Payout">
              {partner.payout_method ? `${partner.payout_method.toUpperCase()}: ` : ''}
              {partner.payout_details ?? 'Not given yet'}
            </Row>
            <Row label="Referral link">
              <span className="font-mono text-xs">{`${publicOrigin()}/r/${partner.code}`}</span>
            </Row>
          </dl>
        </section>
        <PartnerSettings partner={partner} />
      </div>

      <section className="border-border flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-muted-foreground text-xs">Owed now</p>
            <p className="text-xl font-bold tabular-nums">{formatInr(ledger.earnings.pending)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Paid so far</p>
            <p className="text-xl font-bold tabular-nums">{formatInr(ledger.earnings.paid)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Businesses</p>
            <p className="text-xl font-bold tabular-nums">
              {ledger.referrals.length}
              <span className="text-muted-foreground text-sm font-normal"> ({ledger.referrals.filter((r) => r.paying).length} paying)</span>
            </p>
          </div>
        </div>
        <PayoutButton
          partnerId={partner.id}
          pending={ledger.earnings.pending}
          defaultMethod={partner.payout_method}
          payoutDetails={partner.payout_details}
        />
      </section>

      <ReferralsAdmin partnerId={partner.id} referrals={ledger.referrals} />
      <CommissionsAdmin partnerId={partner.id} commissions={ledger.commissions} referrals={ledger.referrals} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Payouts</h2>
        {ledger.payouts.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">No payouts yet.</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-border border-b">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium">Reference</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.payouts.map((p) => (
                  <tr key={p.id} className="border-border border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5">{day(p.paid_at)}</td>
                    <td className="px-4 py-2.5">{p.method ?? '—'}</td>
                    <td className="px-4 py-2.5">{p.reference ?? '—'}</td>
                    <td className="text-muted-foreground px-4 py-2.5">{p.note ?? ''}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
