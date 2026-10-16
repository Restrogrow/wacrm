import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** Accent colour of the card. Defaults to the brand green. */
  tone?: 'green' | 'blue' | 'amber' | 'violet'
}

const TONES = {
  green: {
    chip: 'bg-primary text-primary-foreground shadow-primary/30',
    glow: 'from-primary-soft',
  },
  blue: { chip: 'bg-sky-500 text-white shadow-sky-500/30', glow: 'from-sky-500/10' },
  amber: { chip: 'bg-amber-500 text-white shadow-amber-500/30', glow: 'from-amber-500/10' },
  violet: { chip: 'bg-violet-500 text-white shadow-violet-500/30', glow: 'from-violet-500/10' },
} as const

export function MetricCard({ title, value, icon: Icon, delta, subtitle, tone = 'green' }: MetricCardProps) {
  const t = TONES[tone]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br to-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        t.glow,
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg',
          t.chip,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-3xl leading-none font-bold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{title}</p>
      {delta ? (
        <DeltaChip sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <span className="mt-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {subtitle}
        </span>
      ) : null}
    </div>
  )
}

function DeltaChip({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'bg-primary-soft text-primary'
      : sign < 0
        ? 'bg-red-500/10 text-red-500'
        : 'bg-muted text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <span className={cn('mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', tone)}>
      <Arrow className="h-3 w-3" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
