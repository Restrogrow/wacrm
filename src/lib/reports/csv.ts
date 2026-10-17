// CSV export for report tables.
//
// Spreadsheet apps run text that starts with = + - @ (or a tab / carriage
// return) as a formula, so customer-controlled strings such as a contact or
// broadcast name could execute on someone's machine ("CSV injection").
// String cells with such a prefix get a leading apostrophe, which makes the
// cell inert text. Real numbers are written as-is, so negatives stay numeric.

export type CsvCell = string | number | boolean | null | undefined

export interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvCell
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  let text = String(value)
  if (FORMULA_PREFIX.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','))
  return lines.join('\r\n')
}

/** Browser-only: save a CSV (with a BOM so Excel reads UTF-8 names correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
