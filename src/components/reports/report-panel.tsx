import type { ComponentType, ReactNode } from 'react'

import { PanelTitle } from '@/components/dashboard/panel-title'

/** Card shell shared by every report section. */
export function ReportPanel({
  icon,
  title,
  subtitle,
  action,
  note,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  /** Plain-language caveat shown under the content when a metric is approximate. */
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-1">
        <PanelTitle icon={icon} title={title} subtitle={subtitle} />
        {action}
      </header>
      <div className="space-y-5 p-6 pt-4">{children}</div>
      {note ? (
        <footer className="border-t border-border px-6 py-3 text-xs text-muted-foreground">{note}</footer>
      ) : null}
    </section>
  )
}

/** One headline number. */
export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card-2 p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Inline state for a section that failed to load. */
export function SectionError({ message }: { message: string }) {
  const missing = /could not find the function|does not exist|schema cache/i.test(message)
  return (
    <div role="alert" className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {missing ? (
        <>
          The reports database functions are not installed yet. Run <code>065_reports.sql</code> in the Supabase SQL
          editor, then refresh.
        </>
      ) : (
        <>Could not load this section. {message}</>
      )}
    </div>
  )
}
