'use client'

import { Download } from 'lucide-react'
import type { ReactNode } from 'react'

import { downloadCsv, toCsv, type CsvCell } from '@/lib/reports/csv'
import { cn } from '@/lib/utils'

export interface Column<T> {
  header: string
  /** What the table cell shows. */
  cell: (row: T) => ReactNode
  /** What the CSV file contains (raw value, not a formatted label). */
  csv: (row: T) => CsvCell
  align?: 'left' | 'right'
}

/** Table with a built-in "Export CSV" button. */
export function DataTable<T>({
  columns,
  rows,
  exportColumns,
  rowKey,
  filename,
  empty,
}: {
  columns: Column<T>[]
  /** CSV layout when it should differ from what is shown on screen. */
  exportColumns?: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  filename: string
  empty: ReactNode
}) {
  const exportCsv = () =>
    downloadCsv(
      filename,
      toCsv(
        (exportColumns ?? columns).map((c) => ({ header: c.header, value: c.csv })),
        rows,
      ),
    )

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>
      {rows.length === 0 ? (
        empty
      ) : (
        <div className="max-h-96 overflow-auto rounded-2xl border border-border">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 bg-card-2 text-xs text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.header}
                    scope="col"
                    className={cn('px-4 py-2.5 font-semibold', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-muted/40">
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className={cn('px-4 py-2.5 tabular-nums', c.align === 'right' ? 'text-right' : 'text-left')}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
