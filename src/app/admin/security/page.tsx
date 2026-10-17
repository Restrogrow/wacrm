import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Circle, Clock, ShieldCheck, TriangleAlert } from 'lucide-react'

import {
  AUDIT_DATE,
  CUSTOMER_SCAM_TIPS,
  FINDINGS,
  PLAYBOOK,
  type Finding,
  type FindingStatus,
} from '@/lib/security-report'

export const metadata: Metadata = { title: 'Security report' }

const STATUS: Record<FindingStatus, { label: string; cls: string }> = {
  fixed: { label: 'Fixed in code', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  action: { label: 'Needs you', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  planned: { label: 'Planned', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  accepted: { label: 'OK', cls: 'bg-muted text-muted-foreground' },
}

const SEV: Record<Finding['severity'], string> = {
  High: 'bg-red-500/15 text-red-700 dark:text-red-400',
  Medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  Low: 'bg-muted text-muted-foreground',
  Info: 'bg-muted text-muted-foreground',
}

export default function SecurityReportPage() {
  const count = (s: FindingStatus) => FINDINGS.filter((f) => f.status === s).length
  const needsYou = FINDINGS.filter((f) => f.status === 'action')

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <Link href="/admin" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-3.5" /> Admin dashboard
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-bold tracking-tight">
          <ShieldCheck className="text-primary size-5" /> Security &amp; fraud report
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Audit of {AUDIT_DATE}: a full read-through of the app code, database rules, settings and dependencies, split
          across three independent reviews. This was a code review, not a live attack test. Edit the content in{' '}
          <code>src/lib/security-report.ts</code>.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['fixed', 'action', 'planned', 'accepted'] as FindingStatus[]).map((s) => (
          <div key={s} className="border-border bg-card rounded-2xl border p-4 shadow-sm">
            <p className="text-3xl font-bold">{count(s)}</p>
            <p className="text-muted-foreground mt-1 text-xs font-semibold">{STATUS[s].label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <TriangleAlert className="size-4 text-amber-600" /> Do these next (only you can)
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Run <code>supabase/migrations/061_security_hardening.sql</code> in the Supabase SQL editor. It switches on the
            fake-trial and disposable-email block.
          </li>
          <li>Supabase → Authentication → Attack Protection: enable Turnstile captcha, then ask me to add it to the forms.</li>
          <li>Supabase → Authentication → Rate Limits: lower emails per hour and sign-ins per IP.</li>
          <li>Move the demo passwords into a password manager and delete <code>.env.demo-login</code> and <code>demo-login.txt</code>. Change them if the demo workspace is on the live database.</li>
          <li>Deploy these code changes (the IP fix, the CSRF check and the other fixes only protect the live site after a deploy).</li>
        </ol>
        <p className="text-muted-foreground mt-3 text-xs">Related findings: {needsYou.map((f) => f.id).join(', ')}.</p>
      </section>

      <section>
        <h2 className="text-base font-bold">Findings</h2>
        <div className="border-border bg-card divide-border mt-3 divide-y overflow-hidden rounded-2xl border shadow-sm">
          {FINDINGS.map((f) => (
            <details key={f.id} className="group p-4">
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className="text-muted-foreground w-8 shrink-0 pt-0.5 text-xs font-mono">{f.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="text-muted-foreground block text-xs">{f.area}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEV[f.severity]}`}>{f.severity}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[f.status].cls}`}>
                    {STATUS[f.status].label}
                  </span>
                </span>
              </summary>
              <div className="mt-3 space-y-2 pl-11 text-sm">
                <p>
                  <span className="font-semibold">Risk: </span>
                  {f.risk}
                </p>
                <p>
                  <span className="font-semibold">{f.status === 'fixed' ? 'What changed: ' : f.status === 'action' ? 'What to do: ' : 'Plan: '}</span>
                  {f.note}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold">How to prevent scams, fraud and fake trials</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          No single check stops abuse, so use layers. Each one makes cheating more expensive than it is worth.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {PLAYBOOK.map((layer) => (
            <div key={layer.title} className="border-border bg-card rounded-2xl border p-5 shadow-sm">
              <h3 className="text-sm font-bold">{layer.title}</h3>
              <p className="text-muted-foreground mt-1 text-xs">{layer.why}</p>
              <ul className="mt-3 space-y-1.5 text-xs">
                {layer.inPlace.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    <span>{t}</span>
                  </li>
                ))}
                {layer.todo.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Circle className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <CheckCircle2 className="size-3.5 text-emerald-600" /> in place &nbsp;
          <Circle className="size-3.5" /> still to do
        </p>
      </section>

      <section className="border-border bg-card rounded-2xl border p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Clock className="text-primary size-4" /> Scam warnings to show your customers
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">Paste these on your help page and in the welcome email. Fraudsters often pretend to be you.</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          {CUSTOMER_SCAM_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
