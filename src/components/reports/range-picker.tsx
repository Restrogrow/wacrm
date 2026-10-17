'use client'

import { useState } from 'react'

import { customRange, type RangePreset, type ReportRange } from '@/lib/reports/range'
import { cn } from '@/lib/utils'

const PRESETS: RangePreset[] = [7, 30, 90]

export type RangeSelection = { kind: 'preset'; days: RangePreset } | { kind: 'custom'; range: ReportRange }

export function RangePicker({
  selection,
  onChange,
}: {
  selection: RangeSelection
  onChange: (next: RangeSelection) => void
}) {
  const [open, setOpen] = useState(selection.kind === 'custom')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
    )

  function apply() {
    const result = customRange(from, to)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onChange({ kind: 'custom', range: result.range })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1 rounded-full bg-muted p-1">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            className={pill(selection.kind === 'preset' && selection.days === d)}
            onClick={() => {
              setOpen(false)
              setError(null)
              onChange({ kind: 'preset', days: d })
            }}
          >
            {d} days
          </button>
        ))}
        <button type="button" className={pill(selection.kind === 'custom' || open)} onClick={() => setOpen((v) => !v)}>
          Custom
        </button>
      </div>
      {open ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90"
          >
            Apply
          </button>
          {error ? (
            <p role="alert" className="w-full text-right text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
