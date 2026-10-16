import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, XCircle } from 'lucide-react';

import { getSystemHealth, type CheckState } from '@/lib/ops/health';
import type { JobState } from '@/lib/ops/monitoring';

export const metadata: Metadata = {
  title: 'System health',
};

// Live operations view.
export const dynamic = 'force-dynamic';

const STATE_STYLE: Record<CheckState | JobState, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: 'OK', className: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  warn: { label: 'Needs attention', className: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
  fail: { label: 'Failing', className: 'text-red-600 dark:text-red-400', Icon: XCircle },
  failing: { label: 'Failing', className: 'text-red-600 dark:text-red-400', Icon: XCircle },
  stale: { label: 'Not running', className: 'text-red-600 dark:text-red-400', Icon: XCircle },
  unknown: { label: 'No data', className: 'text-muted-foreground', Icon: CircleHelp },
  never: { label: 'No runs yet', className: 'text-muted-foreground', Icon: CircleHelp },
};

function StateBadge({ state }: { state: CheckState | JobState }) {
  const { label, className, Icon } = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`}>
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}

function formatIst(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export default async function SystemHealthPage() {
  const h = await getSystemHealth({ recentFailures: 50 });

  const overall =
    h.status === 'ok'
      ? { text: 'All systems working', className: 'border-emerald-500/30 bg-emerald-500/5' }
      : h.status === 'degraded'
        ? { text: 'Something needs attention', className: 'border-amber-500/40 bg-amber-500/5' }
        : { text: 'Down — background work or the database is failing', className: 'border-red-500/40 bg-red-500/5' };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
            &larr; Admin dashboard
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight">System health</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Database, background jobs and inbound webhooks. Checked {formatIst(h.checkedAt)} IST. Uptime
            monitors use <code className="text-xs">/api/health</code>.
          </p>
        </div>
        <Link
          href="/admin/system"
          prefetch={false}
          className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-sm"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Link>
      </header>

      <div className={`rounded-2xl border p-5 ${overall.className}`}>
        <p className="font-semibold">{overall.text}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-border rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">Database</p>
          <div className="mt-2">
            <StateBadge state={h.database.state} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {h.database.error ?? (h.database.latencyMs !== null ? `${h.database.latencyMs} ms` : '')}
          </p>
        </div>
        <div className="border-border rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">Configuration</p>
          <div className="mt-2">
            <StateBadge state={h.config.state} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs break-words">
            {h.config.missing.length ? `Missing: ${h.config.missing.join(', ')}` : 'Required env vars set'}
          </p>
        </div>
        <div className="border-border rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">Background jobs</p>
          <div className="mt-2">
            <StateBadge state={h.jobs.state} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {h.jobs.migrationMissing ? 'Run migration 045 to track jobs' : 'Cron every minute'}
          </p>
        </div>
        <div className="border-border rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs font-medium">Webhooks (last hour)</p>
          <div className="mt-2">
            <StateBadge state={h.webhooks.state} />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {h.webhooks.failuresLastHour} failed
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Background jobs</h2>
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr className="border-border border-b">
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium">Last success</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Last error</th>
              </tr>
            </thead>
            <tbody>
              {h.jobs.items.map((job) => (
                <tr key={job.job} className="border-border border-b last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">{job.label}</td>
                  <td className="px-4 py-3">
                    <StateBadge state={job.state} />
                  </td>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{formatIst(job.lastOkAt)}</td>
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    {job.lastDurationMs !== null ? `${job.lastDurationMs} ms` : '—'}
                  </td>
                  <td className="text-muted-foreground max-w-md px-4 py-3 text-xs break-words">
                    {job.lastError ? (
                      <>
                        <span className="text-red-600 dark:text-red-400">{job.lastError}</span>
                        <span className="block">{formatIst(job.lastErrorAt)}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recent webhook failures</h2>
        {h.webhooks.recent.length === 0 ? (
          <p className="border-border text-muted-foreground rounded-2xl border p-5 text-sm">
            No failed webhooks in the last 30 days.
          </p>
        ) : (
          <div className="border-border overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr className="border-border border-b">
                  <th className="px-4 py-2.5 font-medium">When (IST)</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {h.webhooks.recent.map((f) => (
                  <tr key={f.id} className="border-border border-b last:border-0 align-top">
                    <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{formatIst(f.created_at)}</td>
                    <td className="px-4 py-3 capitalize">{f.source}</td>
                    <td className="px-4 py-3">
                      {f.account_id ? (
                        <Link href={`/admin/accounts/${f.account_id}`} className="underline underline-offset-2">
                          View
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-xl px-4 py-3 text-xs break-words">
                      {f.error}
                      {f.context ? (
                        <code className="text-muted-foreground mt-1 block">{JSON.stringify(f.context)}</code>
                      ) : null}
                    </td>
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
