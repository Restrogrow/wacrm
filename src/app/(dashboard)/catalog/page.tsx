'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  FileUp,
  ImageOff,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import { ImportDialog } from '@/components/catalog/import-dialog'
import { StoreSyncMenu } from '@/components/catalog/store-sync-menu'
import { ProductSheet } from '@/components/catalog/product-sheet'
import { PageHero } from '@/components/layout/page-hero'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useCan } from '@/hooks/use-can'
import { formatPrice, type ProductRow } from '@/lib/catalog/core'

type StatusFilter = 'all' | 'active' | 'draft' | 'archived'

interface ListResponse {
  products: ProductRow[]
  total: number
  limit: number | null
  used: number
  catalog_configured: boolean
  unavailable?: boolean
  /** Products (whole account) waiting for "Sync to WhatsApp": pending or failed. */
  needs_sync?: number
}

const PAGE_SIZE = 100
/** The auto-sync after an edit runs after the response, so look again a little later. */
const FOLLOW_UP_RELOADS_MS = [3_000, 8_000]

/** Errors stay up long enough to read (sonner's default is 4 s). */
function showError(message: string) {
  toast.error(message, { duration: 12_000, closeButton: true })
}

const STATUS_STYLE: Record<ProductRow['status'], string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  draft: 'bg-muted text-muted-foreground',
  archived: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

function SyncBadge({ p }: { p: ProductRow }) {
  const map = {
    synced: ['On WhatsApp', 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'],
    pending: ['Not synced', 'bg-sky-500/15 text-sky-700 dark:text-sky-400'],
    error: ['Sync failed', 'bg-red-500/15 text-red-700 dark:text-red-400'],
    skipped: ['Skipped', 'bg-amber-500/15 text-amber-700 dark:text-amber-400'],
  } as const
  const [label, cls] = map[p.meta_sync_status]
  const reason = p.meta_sync_status === 'error' || p.meta_sync_status === 'skipped' ? p.meta_sync_error : null
  return (
    <div className="max-w-[14rem]">
      <span title={p.meta_sync_error ?? undefined} className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
        {label}
      </span>
      {reason && (
        <p title={reason} className="text-muted-foreground mt-1 line-clamp-2 text-xs">
          {reason}
        </p>
      )}
    </div>
  )
}

export default function CatalogPage() {
  const canEdit = useCan('send-messages')
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sheet, setSheet] = useState<{ open: boolean; product: ProductRow | null }>({ open: false, product: null })
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim())
    try {
      const res = await fetch(`/api/catalog/products?${params}`)
      const json = (await res.json()) as ListResponse
      if (res.ok) setData(json)
      else showError('Could not load products')
    } catch {
      showError('Could not load products')
    } finally {
      setLoading(false)
    }
  }, [status, debouncedQ, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const followUps = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => followUps.current.forEach(clearTimeout), [])

  /**
   * Show a saved product right away, then reload now and again shortly so
   * the WhatsApp column shows the auto-sync's result.
   */
  function reloadAfterChange(changed?: ProductRow) {
    if (changed?.id) {
      setData((d) => (d ? { ...d, products: d.products.map((p) => (p.id === changed.id ? changed : p)) } : d))
    }
    void load()
    followUps.current.forEach(clearTimeout)
    followUps.current = FOLLOW_UP_RELOADS_MS.map((ms) => setTimeout(() => void load(), ms))
  }

  const products = useMemo(() => data?.products ?? [], [data])
  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id))
  const needsSync =
    data?.needs_sync ?? products.filter((p) => p.meta_sync_status === 'pending' || p.meta_sync_status === 'error').length

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function call(label: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(label)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        showError((json.error as string) || (json.message as string) || 'Something went wrong')
        return json
      }
      return json
    } finally {
      setBusy(null)
    }
  }

  async function bulk(action: 'archive' | 'activate' | 'delete') {
    const ids = [...selected]
    if (ids.length === 0) return
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} product${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    const json = await call(action, '/api/catalog/products/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) })
    if (json?.ok) {
      toast.success(`${json.count as number} product${json.count === 1 ? '' : 's'} ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'activated'}`)
      if (json.warning) toast.warning(json.warning as string)
      setSelected(new Set())
      reloadAfterChange()
    }
  }

  async function removeOne(p: ProductRow) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return
    const json = await call('delete', `/api/catalog/products/${p.id}`, { method: 'DELETE' })
    if (json?.ok) {
      toast.success('Product deleted')
      if (json.warning) toast.warning(json.warning as string)
      reloadAfterChange()
    }
  }

  async function toggleArchive(p: ProductRow) {
    const json = await call('archive', `/api/catalog/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: p.status === 'archived' ? 'active' : 'archived' }),
    })
    if (json?.product) reloadAfterChange(json.product as ProductRow)
  }

  async function duplicate(p: ProductRow) {
    const json = await call('duplicate', '/api/catalog/products', {
      method: 'POST',
      body: JSON.stringify({
        title: `${p.title} (copy)`,
        description: p.description,
        price_paise: p.price_paise,
        sale_price_paise: p.sale_price_paise,
        currency: p.currency,
        image_url: p.image_url,
        additional_image_urls: p.additional_image_urls,
        product_url: p.product_url,
        brand: p.brand,
        category: p.category,
        availability: p.availability,
        stock_qty: p.stock_qty,
        status: 'draft',
      }),
    })
    if (json?.product) {
      toast.success('Duplicated as a draft')
      reloadAfterChange()
    }
  }

  async function importFromWhatsApp() {
    const json = await call('import-meta', '/api/catalog/meta-import', { method: 'POST', body: JSON.stringify({}) })
    if (!json) return
    if (json.ok) {
      const created = json.created as number
      if (created > 0) toast.success(`Imported ${created} product${created === 1 ? '' : 's'} from your WhatsApp catalog`)
      else toast.info((json.fetched as number) === 0 ? 'Connected to your WhatsApp catalog. It has no products yet, so there was nothing to fetch.' : 'Nothing new to import. Those products are already here.')
      if (json.message) toast.warning(json.message as string)
      if (json.truncated) toast.info('Your catalog is large. Only the first 2,000 products were read.')
      void load()
    } else if (json.message) {
      showError(json.message as string)
    }
  }

  async function sync(ids?: string[]) {
    const json = await call('sync', '/api/catalog/meta-sync', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) })
    if (!json) return
    if (json.ok) {
      const parts = [`${json.synced as number} synced`]
      if ((json.deleted as number) > 0) parts.push(`${json.deleted as number} removed`)
      if ((json.skipped as number) > 0) parts.push(`${json.skipped as number} skipped`)
      toast.success(`WhatsApp catalog: ${parts.join(', ')}`)
      if ((json.remaining as number) > 0) toast.info(`${json.remaining as number} more waiting. Press Sync again.`)
    } else if (json.message) {
      showError(json.message as string)
    }
    void load()
  }

  const used = data?.used ?? 0
  const limit = data?.limit ?? null

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHero
        icon={Package}
        title="Product catalog"
        description="Your products, ready to share on WhatsApp. Add them here and sync them to your WhatsApp catalog."
        action={
          <div className="flex flex-wrap gap-2">
            <StoreSyncMenu onDone={() => reloadAfterChange()} />
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!canEdit}>
              <FileUp className="size-3.5" /> Import CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
                const a = document.createElement('a')
                a.href = '/api/catalog/export'
                a.click()
              }}>
              <Download className="size-3.5" /> Export
            </Button>
            <Button size="sm" onClick={() => setSheet({ open: true, product: null })} disabled={!canEdit}>
              <Plus className="size-3.5" /> Add product
            </Button>
          </div>
        }
      />

      {data?.unavailable && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          The product catalog is not set up on this server yet. Run migration <code>076_products_catalog.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      )}

      {data && !data.catalog_configured && !data.unavailable && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-sky-600" />
          <span>
            Products are saved here, but they will not appear on WhatsApp until you add your catalog ID in{' '}
            <Link href="/orders" className="text-primary font-medium underline underline-offset-2">
              Orders &amp; payments
            </Link>
            .
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {(['all', 'active', 'draft', 'archived'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatus(s)
                setPage(0)
                setSelected(new Set())
              }}
              className={`rounded-lg px-3 py-1.5 font-medium capitalize ${status === s ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {s}
            </button>
          ))}
          {limit !== null && (
            <span className="text-muted-foreground ml-2 text-xs">
              {used} of {limit} products
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(0)
              }}
              placeholder="Search name, SKU or category"
              className="w-full pl-8 sm:w-64"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => importFromWhatsApp()} disabled={!canEdit || busy !== null || !data?.catalog_configured} title={data?.catalog_configured ? 'Bring in the products already in your WhatsApp catalog' : 'Add your catalog ID first'}>
            {busy === 'import-meta' ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Fetch from WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={() => sync()} disabled={!canEdit || busy !== null || !data?.catalog_configured} title={data?.catalog_configured ? undefined : 'Add your catalog ID first'}>
            {busy === 'sync' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Sync to WhatsApp{needsSync > 0 ? ` (${needsSync} waiting)` : ''}
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-primary-soft flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
          <b>{selected.size}</b> selected
          <Button size="sm" variant="outline" onClick={() => sync([...selected])} disabled={!canEdit || busy !== null || !data?.catalog_configured}>
            Sync
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk('archive')} disabled={!canEdit || busy !== null}>
            <Archive className="size-3.5" /> Archive
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk('activate')} disabled={!canEdit || busy !== null}>
            Activate
          </Button>
          <Button size="sm" variant="destructive" onClick={() => bulk('delete')} disabled={!canEdit || busy !== null}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
          <button className="text-muted-foreground ml-auto text-xs hover:underline" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-muted-foreground p-12 text-center text-sm">
            {debouncedQ || status !== 'all' ? (
              'No products match.'
            ) : (
              <>
                <Package className="mx-auto mb-3 size-8 opacity-50" />
                No products yet. Add one, or import a CSV from Shopify, WooCommerce or a spreadsheet.
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => setSelected(v ? new Set(products.map((p) => p.id)) : new Set())}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">WhatsApp</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Select ${p.title}`} />
                    </td>
                    <td className="p-3">
                      <button className="flex items-center gap-3 text-left" onClick={() => setSheet({ open: true, product: p })}>
                        <span className="bg-muted border-border flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt="" className="size-full object-cover" />
                          ) : (
                            <ImageOff className="text-muted-foreground size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-xs truncate font-medium">{p.title}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {p.retailer_id}
                            {p.category ? ` · ${p.category}` : ''}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {p.sale_price_paise !== null ? (
                        <>
                          <span className="font-medium">{formatPrice(p.sale_price_paise, p.currency)}</span>{' '}
                          <span className="text-muted-foreground text-xs line-through">{formatPrice(p.price_paise, p.currency)}</span>
                        </>
                      ) : (
                        <span className="font-medium">{formatPrice(p.price_paise, p.currency)}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {p.stock_qty !== null ? (
                        <span className={p.stock_qty > 0 ? '' : 'text-red-600'}>{p.stock_qty > 0 ? p.stock_qty : 'Out of stock'}</span>
                      ) : (
                        <span className={p.availability === 'in stock' ? 'text-muted-foreground' : 'text-red-600'}>
                          {p.availability === 'in stock' ? 'In stock' : 'Out of stock'}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="p-3">
                      <SyncBadge p={p} />
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => setSheet({ open: true, product: p })}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Duplicate" disabled={!canEdit || busy !== null} onClick={() => duplicate(p)}>
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={p.status === 'archived' ? 'Restore' : 'Archive'}
                          disabled={!canEdit || busy !== null}
                          onClick={() => toggleArchive(p)}
                        >
                          {p.status === 'archived' ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Delete" disabled={!canEdit || busy !== null} onClick={() => removeOne(p)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= data.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <ProductSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        product={sheet.product}
        canEdit={canEdit}
        onSaved={reloadAfterChange}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => reloadAfterChange()} />
    </div>
  )
}
