'use client'

// Reports → Customer satisfaction. Self-contained: loads csat_responses for the
// chosen range through the signed-in user's access rules (RLS), so it only ever
// sees its own account. Shows average (1-3), response rate and the split of
// Great / Okay / Bad, plus a per-agent table with a CSV export.

import { useEffect, useState } from 'react'
import { Smile } from 'lucide-react'

import { EmptyState } from '@/components/dashboard/empty-state'
import { Skeleton } from '@/components/dashboard/skeleton'
import { DataTable, type Column } from '@/components/reports/data-table'
import { Kpi, ReportPanel, SectionError } from '@/components/reports/report-panel'
import { CSAT_LABELS, summarizeCsat, type CsatRating } from '@/lib/csat/core'
import { formatCount, formatPct } from '@/lib/reports/format'
import { createClient } from '@/lib/supabase/client'

interface Row {
  rating: number | null
  agent_id: string | null
}

interface AgentScore {
  agent: string
  sent: number
  answered: number
  average: number | null
}

type State =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; rows: Row[]; names: Record<string, string> }

export function CsatSection({ accountId, from, to, stamp }: { accountId: string; from: Date; to: Date; stamp: string }) {
  const [result, setResult] = useState<{ key: string; value: State } | null>(null)
  const key = `${accountId}|${from.getTime()}|${to.getTime()}`

  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('csat_responses')
        .select('rating, agent_id')
        .eq('account_id', accountId)
        .gte('sent_at', from.toISOString())
        .lt('sent_at', to.toISOString())
        .limit(20000)
      if (cancelled) return
      if (error) {
        setResult({ key, value: { state: 'error', message: error.message } })
        return
      }
      const rows = (data ?? []) as Row[]
      const ids = Array.from(new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x)))
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', ids)
        for (const p of profiles ?? []) names[p.user_id as string] = (p.full_name as string) || (p.email as string) || 'Team member'
      }
      if (!cancelled) setResult({ key, value: { state: 'ready', rows, names } })
    })()
    return () => {
      cancelled = true
    }
  }, [key, accountId, from, to])

  const section: State = result && result.key === key ? result.value : { state: 'loading' }

  return (
    <ReportPanel
      icon={Smile}
      title="Customer satisfaction"
      subtitle="Ratings customers gave after a chat was closed"
      note="Turn this on in Settings → Saved replies → Ask for a rating. Ratings: Great = 3, Okay = 2, Bad = 1. Agents are credited by who owned the chat when it was closed."
    >
      {section.state === 'loading' ? (
        <Skeleton className="h-40 w-full" />
      ) : section.state === 'error' ? (
        <SectionError message={section.message} />
      ) : (
        <Body rows={section.rows} names={section.names} stamp={stamp} />
      )}
    </ReportPanel>
  )
}

function Body({ rows, names, stamp }: { rows: Row[]; names: Record<string, string>; stamp: string }) {
  const s = summarizeCsat(rows)
  if (s.sent === 0) {
    return (
      <EmptyState
        icon={Smile}
        title="No ratings requested in this range"
        hint="Turn on “Ask for a rating when a chat is closed” in Settings, then close a chat."
      />
    )
  }

  const byAgent = new Map<string, Row[]>()
  for (const r of rows) {
    const k = r.agent_id ?? ''
    byAgent.set(k, [...(byAgent.get(k) ?? []), r])
  }
  const agents: AgentScore[] = Array.from(byAgent.entries())
    .map(([id, list]) => {
      const sum = summarizeCsat(list)
      return {
        agent: id ? names[id] ?? 'Former team member' : 'Unassigned',
        sent: sum.sent,
        answered: sum.answered,
        average: sum.average,
      }
    })
    .sort((a, b) => b.answered - a.answered)

  const columns: Column<AgentScore>[] = [
    { header: 'Agent', cell: (r) => r.agent, csv: (r) => r.agent },
    { header: 'Requested', align: 'right', cell: (r) => formatCount(r.sent), csv: (r) => r.sent },
    { header: 'Answered', align: 'right', cell: (r) => formatCount(r.answered), csv: (r) => r.answered },
    {
      header: 'Average (1-3)',
      align: 'right',
      cell: (r) => (r.average === null ? '-' : r.average.toFixed(2)),
      csv: (r) => (r.average === null ? '' : r.average),
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Average rating" value={s.average === null ? '-' : `${s.average.toFixed(2)} / 3`} hint={s.answered ? `${s.answered} answers` : 'no answers yet'} />
        <Kpi label="Rated Great" value={s.greatPct === null ? '-' : formatPct(s.greatPct)} />
        <Kpi label="Response rate" value={s.responseRate === null ? '-' : formatPct(s.responseRate)} hint={`${s.answered} of ${s.sent} answered`} />
        <Kpi label="Requested" value={formatCount(s.sent)} />
      </div>

      <div className="space-y-2">
        {([3, 2, 1] as CsatRating[]).map((r) => {
          const count = s.distribution[r]
          const pct = s.answered ? Math.round((count / s.answered) * 100) : 0
          return (
            <div key={r} className="flex items-center gap-3 text-xs">
              <span className="w-12 text-muted-foreground">{CSAT_LABELS[r]}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={r === 3 ? 'h-full bg-emerald-500' : r === 2 ? 'h-full bg-amber-500' : 'h-full bg-red-500'}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-20 text-right tabular-nums">
                {count} ({pct}%)
              </span>
            </div>
          )
        })}
      </div>

      <DataTable
        columns={columns}
        rows={agents}
        rowKey={(r) => r.agent}
        filename={`csat-${stamp}`}
        empty={<p className="text-sm text-muted-foreground">No ratings to show per agent.</p>}
      />
    </>
  )
}
