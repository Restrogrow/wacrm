import { IconChip } from '@/components/icon-chip';
import type { ComponentType, ReactNode } from 'react'

/** Icon chip + title + subtitle used by every dashboard panel header. */
export function PanelTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  subtitle?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <IconChip icon={Icon} className="h-10 w-10 shrink-0 rounded-2xl" />
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  )
}
