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
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  )
}
