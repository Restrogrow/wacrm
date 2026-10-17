'use client'

// CSV import: choose a file → "Check file" shows what we understood and any
// problem rows → "Import". Shopify and WooCommerce exports work as they are.

import { useRef, useState } from 'react'
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PRODUCT_CSV_TEMPLATE } from '@/lib/catalog/csv'
import { downloadCsv } from '@/lib/reports/csv'

interface Report {
  valid: number
  invalid: number
  ignored: number
  errors: Array<{ line: number; message: string }>
  mapped: Record<string, string>
  unmapped: string[]
  warning?: string
  created?: number
  updated?: number
}

const FIELD_LABELS: Record<string, string> = {
  retailer_id: 'SKU',
  title: 'Name',
  description: 'Description',
  price: 'Price',
  sale_price: 'Sale price',
  compare_at: 'Compare-at price',
  image: 'Photo',
  extra_images: 'Extra photos',
  stock: 'Stock',
  availability: 'Availability',
  category: 'Category',
  brand: 'Brand',
  link: 'Product link',
  status: 'Status',
  currency: 'Currency',
}

export function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState<'check' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCsv(null)
    setFileName('')
    setReport(null)
    setError(null)
  }

  async function pick(file: File | undefined) {
    if (!file) return
    reset()
    if (file.size > 5_000_000) return setError('That file is too large. Keep it under 5 MB.')
    setFileName(file.name)
    const text = await file.text()
    setCsv(text)
    void run(text, true)
  }

  async function run(text: string, dry: boolean) {
    setBusy(dry ? 'check' : 'import')
    setError(null)
    try {
      const res = await fetch('/api/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, dry_run: dry }),
      })
      const json = (await res.json().catch(() => ({}))) as Report & { error?: string }
      if (!res.ok) {
        setReport(json.errors ? json : null)
        setError(json.error || 'Could not read the file.')
        return
      }
      setReport(json)
      if (!dry) {
        toast.success(`Imported: ${json.created ?? 0} added, ${json.updated ?? 0} updated`)
        onDone()
        onOpenChange(false)
        reset()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="bg-popover border-border text-popover-foreground max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Up to 2,000 products. Works with our template and with Shopify or WooCommerce exports. Products with the same SKU are updated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv('products-template.csv', PRODUCT_CSV_TEMPLATE)}>
            <Download className="size-3.5" /> Download template
          </Button>
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
            <FileUp className="size-3.5" /> Choose CSV file
          </Button>
          {fileName && <span className="text-muted-foreground truncate text-xs">{fileName}</span>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        {busy === 'check' && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Checking your file…
          </p>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {report && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <span>
                <b>{report.valid}</b> ready to import
                {report.invalid > 0 && <>, <b className="text-amber-600">{report.invalid}</b> with problems (skipped)</>}
                {report.ignored > 0 && <>, {report.ignored} extra image/variant rows ignored</>}
              </span>
            </div>
            {report.warning && <p className="text-xs text-amber-600">{report.warning}</p>}

            {Object.keys(report.mapped).length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold">How we read your columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(report.mapped).map(([field, col]) => (
                    <span key={field} className="bg-muted rounded-full px-2 py-0.5 text-xs">
                      {col} → {FIELD_LABELS[field] ?? field}
                    </span>
                  ))}
                </div>
                {report.unmapped.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">Not used: {report.unmapped.slice(0, 12).join(', ')}{report.unmapped.length > 12 ? '…' : ''}</p>
                )}
              </div>
            )}

            {report.errors.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold">Rows with problems</p>
                <ul className="border-border max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2 text-xs">
                  {report.errors.map((e, i) => (
                    <li key={i}>
                      <b>Row {e.line}:</b> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!csv || !report || report.valid === 0 || busy !== null || !!error} onClick={() => csv && run(csv, false)}>
            {busy === 'import' && <Loader2 className="size-3.5 animate-spin" />}
            Import {report?.valid ? `${report.valid} products` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
