// ============================================================
// Platform admin dashboard widgets — server-rendered, no JS needed.
//
//   StatTile     headline number + change vs. the previous period
//   DailyColumns one-series column chart (sign-ups per IST day), hover
//                tooltip per bar, plus a screen-reader table
//   BarList      ranked horizontal bars for breakdowns and the funnel
//
// Single series everywhere, so one hue (the theme's primary token) and
// no legend; text always uses text tokens, never the bar colour.
// ============================================================

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { formatDayLabel, type DayCount } from '@/lib/admin/time';

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** e.g. "+3" — sign decides the arrow colour. */
  delta?: string;
  deltaLabel?: string;
  hint?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const up = delta?.startsWith('+');
  const down = delta?.startsWith('−');
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'text-foreground mt-1.5 text-2xl font-bold tabular-nums',
          tone === 'danger' && 'text-red-500'
        )}
      >
        {value}
      </p>
      {(delta || hint) && (
        <p className="text-muted-foreground mt-1 text-xs">
          {delta && (
            <span
              className={cn(
                'mr-1 font-medium tabular-nums',
                up && 'text-emerald-600 dark:text-emerald-400',
                down && 'text-red-500'
              )}
            >
              {up ? '▲ ' : down ? '▼ ' : ''}
              {delta}
            </span>
          )}
          {deltaLabel}
          {hint}
        </p>
      )}
    </div>
  );
}

export function DailyColumns({
  title,
  series,
  unit,
}: {
  title: string;
  series: DayCount[];
  /** Singular noun for tooltips, e.g. "sign-up". */
  unit: string;
}) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((sum, d) => sum + d.count, 0);
  const plural = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  return (
    <figure className="border-border bg-card rounded-2xl border p-4">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-foreground text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs">
          {plural(total)} in {series.length} days · peak {max}
        </span>
      </figcaption>

      <div className="relative">
        {/* Recessive guide at the peak value */}
        <div className="border-border pointer-events-none absolute inset-x-0 top-0 border-t border-dashed" />
        <span className="bg-card text-muted-foreground pointer-events-none absolute -top-2.5 right-0 pl-1 text-[10px] tabular-nums">
          {max}
        </span>

        <div
          className="border-border flex h-40 items-end gap-0.5 border-b"
          aria-hidden="true"
        >
          {series.map((d) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <div
                className={cn(
                  'bg-primary w-full max-w-6 rounded-t-[4px] transition-opacity',
                  'group-hover:opacity-80',
                  d.count === 0 && 'bg-muted'
                )}
                style={{
                  height: d.count === 0 ? 2 : `${(d.count / max) * 100}%`,
                }}
              />
              <div className="border-border bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border px-2 py-1 text-xs whitespace-nowrap shadow-md group-hover:block">
                <span className="font-medium">{formatDayLabel(d.day)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {plural(d.count)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div
          className="text-muted-foreground mt-1.5 flex justify-between text-[10px]"
          aria-hidden="true"
        >
          {series
            .filter((_, i) => i % 7 === 0 || i === series.length - 1)
            .map((d) => (
              <span key={d.day}>{formatDayLabel(d.day)}</span>
            ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{formatDayLabel(d.day)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function BarList({
  title,
  items,
  total,
  empty = 'No data yet',
}: {
  title: string;
  items: { label: string; count: number }[];
  /** Percent base; defaults to the largest item (funnels pass the first step). */
  total?: number;
  empty?: string;
}) {
  const base = total ?? Math.max(1, ...items.map((i) => i.count));
  const shareBase = items.reduce((s, i) => s + i.count, 0) || 1;
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <p className="text-foreground mb-3 text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const pct = Math.round(
              (total ? item.count / base : item.count / shareBase) * 100
            );
            return (
              <li
                key={item.label}
                title={`${item.label}: ${item.count} (${pct}%)`}
              >
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="text-foreground truncate">{item.label}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {item.count} · {pct}%
                  </span>
                </div>
                <div className="bg-muted h-2 rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${Math.max(item.count > 0 ? 2 : 0, (item.count / base) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
