import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { formatInr, PARTNER_STATUS_LABELS, type PartnerStatus } from '@/lib/partners/program';
import { listPartners } from '@/lib/partners/server';

export const metadata: Metadata = {
  title: 'Partners',
};

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<PartnerStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  rejected: 'bg-muted text-muted-foreground',
  suspended: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AdminPartnersPage() {
  const partners = await listPartners();
  const applications = partners.filter((p) => p.status === 'pending');
  const totals = partners.reduce(
    (t, p) => ({
      referrals: t.referrals + p.referrals,
      paying: t.paying + p.paying,
      pending: t.pending + p.pending,
      paid: t.paid + p.paid,
    }),
    { referrals: 0, paying: 0, pending: 0, paid: 0 }
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <Link href="/admin" prefetch={false} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-3.5" />
          Admin
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Partners</h1>
        <p className="text-muted-foreground text-sm">
          People who bring businesses to Repeat Grow. Partners apply at /partner (not linked anywhere yet). Commission is
          added when you enter &ldquo;Amount received&rdquo; on a referred account&rsquo;s plan.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card label="Active partners" value={String(partners.filter((p) => p.status === 'approved').length)} />
        <Card label="Applications waiting" value={String(applications.length)} />
        <Card label="Businesses referred" value={`${totals.referrals} (${totals.paying} paying)`} />
        <Card label="Owed to partners" value={formatInr(totals.pending)} />
        <Card label="Paid to partners" value={formatInr(totals.paid)} />
      </div>

      {partners.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">
          No partners yet. Share repeatgrow.com/partner with the people you want to invite.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">Partner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                <th className="px-4 py-2.5 text-right font-medium">Referred</th>
                <th className="px-4 py-2.5 text-right font-medium">Paying</th>
                <th className="px-4 py-2.5 text-right font-medium">Owed</th>
                <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {partners.map((p) => (
                <tr key={p.id} className="border-border hover:bg-muted/40 border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/partners/${p.id}`} prefetch={false} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">{p.company || p.email}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[p.status]}`}>
                      {PARTNER_STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-2.5 text-right">{p.commission_rate}%</td>
                  <td className="px-4 py-2.5 text-right">{p.clicks}</td>
                  <td className="px-4 py-2.5 text-right">{p.referrals}</td>
                  <td className="px-4 py-2.5 text-right">{p.paying}</td>
                  <td className="px-4 py-2.5 text-right">{formatInr(p.pending)}</td>
                  <td className="px-4 py-2.5 text-right">{formatInr(p.paid)}</td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-2.5 text-xs">
                    {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
