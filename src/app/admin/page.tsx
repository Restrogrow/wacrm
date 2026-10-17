import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, FileText, RefreshCw, Mail, ShieldCheck } from 'lucide-react';

import { loadAdminDashboard } from '@/lib/admin/dashboard';
import { formatDelta } from '@/lib/admin/time';
import { AccountsTable } from '@/components/admin/accounts-table';
import { DeletionRequests } from '@/components/admin/deletion-requests';
import { loadDeletionRequests } from '@/lib/admin/deletion-requests';
import { DemoRequests } from '@/components/admin/demo-requests';
import { loadDemoRequests } from '@/lib/admin/demo-requests';
import {
  BarList,
  DailyColumns,
  StatTile,
} from '@/components/admin/dashboard-widgets';

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

// Always fresh: this is a live operations view.
export const dynamic = 'force-dynamic';

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';

export default async function PlatformAdminPage() {
  const [d, deletions, demos] = await Promise.all([
    loadAdminDashboard(),
    loadDeletionRequests(),
    loadDemoRequests(),
  ]);
  const s = d.signups;
  const a = d.accounts;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Admin dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every Repeat Grow account at a glance. Days use India time (IST).
            Updated{' '}
            {new Date(d.generatedAt).toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })}
            .
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <Link
            href="/admin/security"
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <ShieldCheck className="size-3.5" />
            Security
          </Link>
          <Link
            href="/admin/blog"
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <FileText className="size-3.5" />
            Blog
          </Link>
          <Link
            href="/admin/emails"
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <Mail className="size-3.5" />
            Emails
          </Link>
          <Link
            href="/admin/system"
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <Activity className="size-3.5" />
            System health
          </Link>
          <Link
            href="/admin"
            prefetch={false}
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Link>
        </div>
      </header>

      {/* ---------------- Demo requests ---------------- */}
      <section id="demo-requests" className="space-y-3">
        <h2 className="text-foreground text-sm font-semibold">
          Demo requests
          {demos.counts.new > 0 && (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {demos.counts.new} new
            </span>
          )}
        </h2>
        <DemoRequests data={demos} />
      </section>

      {/* ---------------- Deletion requests ---------------- */}
      {(deletions.pending.length > 0 || !deletions.available) && (
        <section id="deletion-requests" className="space-y-3">
          <h2 className="text-foreground text-sm font-semibold">
            Account deletion requests
            {deletions.pending.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                {deletions.pending.length} waiting
              </span>
            )}
          </h2>
          <DeletionRequests data={deletions} />
        </section>
      )}

      {/* ---------------- Sign-ups ---------------- */}
      <section className="space-y-3">
        <h2 className="text-foreground text-sm font-semibold">Sign-ups</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Today"
            value={s.today}
            delta={formatDelta(s.today, s.yesterday)}
            deltaLabel="vs yesterday"
          />
          <StatTile
            label="Last 7 days"
            value={s.last7}
            delta={formatDelta(s.last7, s.prev7)}
            deltaLabel="vs previous 7 days"
          />
          <StatTile
            label="Last 30 days"
            value={s.last30}
            delta={formatDelta(s.last30, s.prev30)}
            deltaLabel="vs previous 30 days"
          />
          <StatTile
            label="All accounts"
            value={s.total}
            hint={`${s.usersTotal} users · ${s.usersToday} new today (incl. teammates)`}
          />
        </div>
        <DailyColumns
          title="New accounts per day — last 30 days"
          series={d.daily}
          unit="sign-up"
        />
      </section>

      {/* ---------------- Health ---------------- */}
      <section className="space-y-3">
        <h2 className="text-foreground text-sm font-semibold">
          Accounts &amp; activity
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="WhatsApp connected"
            value={a.whatsappConnected}
            hint={`${pct(a.whatsappConnected, s.total)} of accounts`}
          />
          <StatTile
            label="Active in last 7 days"
            value={a.active7}
            hint={`${pct(a.active7, s.total)} had a chat`}
          />
          <StatTile
            label="Messages today"
            value={d.messagesToday.inbound + d.messagesToday.outbound}
            hint={`${d.messagesToday.inbound} received · ${d.messagesToday.outbound} sent`}
          />
          <StatTile
            label="Logged in today"
            value={a.loggedInToday}
            hint="users"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {a.billingEnabled ? (
            <>
              <StatTile
                label="Paying"
                value={a.paying}
                hint={`${pct(a.paying, s.total)} of accounts`}
              />
              <StatTile label="On free trial" value={a.trial} />
              <StatTile
                label="Trial ended (read-only)"
                value={a.expired}
                tone={a.expired > 0 ? 'danger' : 'default'}
                hint="follow up to convert"
              />
            </>
          ) : (
            <StatTile
              label="Plans"
              value="—"
              hint="Run migration 041 to track plans and trials"
            />
          )}
          <StatTile
            label="Integrations"
            value={(a.shopify ?? 0) + (a.calendly ?? 0)}
            hint={`Shopify ${a.shopify ?? '—'} · Calendly ${a.calendly ?? '—'}`}
          />
        </div>
      </section>

      {/* ---------------- Funnel & breakdowns ---------------- */}
      <section className="grid gap-3 lg:grid-cols-2">
        <BarList
          title="Funnel (share of all sign-ups)"
          items={d.funnel}
          total={s.total || 1}
        />
        <BarList
          title="Plan"
          items={d.breakdowns.plan}
          empty="Plans not set up yet"
        />
        <BarList title="Sign-up method" items={d.breakdowns.signupMethod} />
        <BarList title="Nature of business" items={d.breakdowns.business} />
        <BarList title="Team size" items={d.breakdowns.teamSize} />
      </section>

      {/* ---------------- Accounts ---------------- */}
      <section className="space-y-3">
        <h2 className="text-foreground text-sm font-semibold">Accounts</h2>
        <AccountsTable rows={d.rows} />
      </section>

      {/* Deletion history when nothing is waiting (pending ones show at the top). */}
      {deletions.available && deletions.pending.length === 0 && (
        <section id="deletion-requests" className="space-y-3">
          <h2 className="text-foreground text-sm font-semibold">Account deletion requests</h2>
          <DeletionRequests data={deletions} />
        </section>
      )}
    </div>
  );
}
