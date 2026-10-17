'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarHeart, Eye, Loader2, Pencil, Plus, Repeat, Trash2, TriangleAlert, UserRoundPlus, Waypoints } from 'lucide-react'
import { toast } from 'sonner'

import { PageHero } from '@/components/layout/page-hero'
import { SendingRulesCard } from '@/components/journeys/sending-rules-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useCan } from '@/hooks/use-can'
import { JOURNEY_KIND_LABELS, type JourneyKind } from '@/lib/journeys/core'

interface Stats {
  enrolled: number
  sent: number
  replied: number
  completed: number
  opted_out: number
  failed: number
}

interface JourneyItem {
  id: string
  name: string
  kind: JourneyKind
  status: 'draft' | 'active' | 'paused'
  config: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  steps: Array<{ delay_minutes: number }>
  stats: Stats
}

const KIND_ICON = { date: CalendarHeart, drip: Waypoints, winback: UserRoundPlus } as const

function describe(j: JourneyItem): string {
  const c = j.config
  if (j.kind === 'date') {
    const off = Number(c.offset_days ?? 0)
    const when = off === 0 ? 'On the day' : off < 0 ? `${-off} day${off === -1 ? '' : 's'} before` : `${off} day${off === 1 ? '' : 's'} after`
    return `${when} at ${c.send_time ?? '10:00'}${c.recurrence === 'once' ? '' : ', every year'}`
  }
  if (j.kind === 'drip') {
    const mode = c.enrollment?.mode
    const via = mode === 'tag' ? 'joins by tag' : mode === 'segment' ? 'joins by segment' : 'added by hand'
    return `${j.steps.length} message${j.steps.length === 1 ? '' : 's'}, ${via}`
  }
  return `People inactive for ${c.inactive_days ?? 30}+ days, then not again for ${c.cooldown_days ?? 90} days`
}

export default function JourneysPage() {
  const canEdit = useCan('send-messages')
  const [items, setItems] = useState<JourneyItem[] | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const res = await fetch('/api/journeys')
    const json = await res.json().catch(() => ({}))
    setAvailable(json.available !== false)
    setItems((json.journeys ?? []) as JourneyItem[])
  }, [])

  useEffect(() => {
    let alive = true
    void fetch('/api/journeys')
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return
        setAvailable(json.available !== false)
        setItems((json.journeys ?? []) as JourneyItem[])
      })
      .catch(() => {
        if (alive) setItems([])
      })
    return () => {
      alive = false
    }
  }, [])

  async function toggle(j: JourneyItem) {
    setBusy(j.id)
    const next = j.status === 'active' ? 'paused' : 'active'
    const res = await fetch(`/api/journeys/${j.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) toast.error(json.error || 'Could not change the journey')
    else {
      toast.success(next === 'active' ? 'Journey is on' : 'Journey paused')
      void load()
    }
  }

  async function remove(j: JourneyItem) {
    if (!window.confirm(`Delete "${j.name}" and its history? This cannot be undone.`)) return
    setBusy(j.id)
    const res = await fetch(`/api/journeys/${j.id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok) {
      toast.success('Journey deleted')
      void load()
    } else toast.error('Could not delete')
  }

  async function dryRun(j: JourneyItem) {
    setBusy(j.id)
    const res = await fetch(`/api/journeys/${j.id}/preview`, { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return toast.error(json.error || 'Could not preview')
    const text =
      json.kind === 'date'
        ? `${json.contacts_with_date} contacts have a date. Due today: ${json.due_today} · next 7 days: ${json.due_next_7_days} · next 30 days: ${json.due_next_30_days}${json.unreadable_dates ? ` · ${json.unreadable_dates} dates could not be read` : ''}. Nothing was sent.`
        : `Would enroll ${json.would_enroll_now} contact${json.would_enroll_now === 1 ? '' : 's'} now (${json.already_enrolled} already in). Nothing was sent.`
    setPreview((p) => ({ ...p, [j.id]: text }))
  }

  return (
    <div className="space-y-5">
      <PageHero
        icon={Repeat}
        title="Journeys"
        description="Automatic lifecycle messages: birthdays and renewals, drip sequences and win-back campaigns."
        action={
          canEdit ? (
            <Link href="/journeys/new" className={buttonVariants()}>
              <Plus className="size-4" /> New journey
            </Link>
          ) : undefined
        }
      />

      <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="font-semibold">WhatsApp marketing rules</p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
            <li>Only message people who agreed to hear from you. Anyone who replies STOP is skipped automatically.</li>
            <li>Messages outside the 24-hour reply window must use a template that Meta has approved.</li>
            <li>Too many blocks or reports lower your quality rating and can limit your number. Start small and keep messages useful.</li>
            <li>People get at most one journey message per day by default, and nothing goes out during quiet hours.</li>
          </ul>
        </div>
      </div>

      <SendingRulesCard />

      {!available && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Journeys are not set up on this server yet. Run migration <code>075_journeys.sql</code> in the Supabase SQL editor.
        </div>
      )}

      {items === null ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 && available ? (
        <div className="border-border bg-card grid gap-4 rounded-2xl border p-6 shadow-sm sm:grid-cols-3">
          {(['date', 'drip', 'winback'] as JourneyKind[]).map((k) => {
            const Icon = KIND_ICON[k]
            return (
              <Link
                key={k}
                href={canEdit ? `/journeys/new?kind=${k}` : '#'}
                className="border-border hover:border-primary rounded-xl border p-4 transition-colors"
              >
                <Icon className="text-primary size-5" />
                <p className="mt-2 text-sm font-bold">{JOURNEY_KIND_LABELS[k]}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {k === 'date'
                    ? 'Birthday wishes, anniversaries, renewal reminders and follow-ups on a date you choose.'
                    : k === 'drip'
                      ? 'A series of messages over days or weeks that stops when the customer replies.'
                      : 'Gently reach people who went quiet, at most once in a while.'}
                </p>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((j) => {
            const Icon = KIND_ICON[j.kind]
            const s = j.stats
            return (
              <div key={j.id} className="border-border bg-card rounded-2xl border p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="bg-primary-soft text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{j.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {JOURNEY_KIND_LABELS[j.kind]} · {describe(j)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        j.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : j.status === 'paused'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {j.status === 'active' ? 'On' : j.status === 'paused' ? 'Paused' : 'Draft'}
                    </span>
                    <Switch
                      checked={j.status === 'active'}
                      disabled={!canEdit || busy === j.id}
                      onCheckedChange={() => void toggle(j)}
                      aria-label={j.status === 'active' ? 'Pause journey' : 'Turn journey on'}
                    />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
                  {[
                    ['Enrolled', s.enrolled],
                    ['Sent', s.sent],
                    ['Replied', s.replied],
                    ['Completed', s.completed],
                    ['Opted out', s.opted_out],
                    ['Failed', s.failed],
                  ].map(([label, value]) => (
                    <div key={label as string} className="bg-muted/50 rounded-xl py-2">
                      <dd className="text-lg font-bold">{value as number}</dd>
                      <dt className="text-muted-foreground text-[11px]">{label}</dt>
                    </div>
                  ))}
                </dl>

                {preview[j.id] && <p className="bg-primary-soft text-primary mt-3 rounded-lg px-3 py-2 text-xs">{preview[j.id]}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void dryRun(j)} disabled={busy === j.id}>
                    <Eye className="size-3.5" /> Preview audience
                  </Button>
                  {canEdit && (
                    <>
                      <Link href={`/journeys/${j.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                        <Pencil className="size-3.5" /> Edit
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => void remove(j)} disabled={busy === j.id}>
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
