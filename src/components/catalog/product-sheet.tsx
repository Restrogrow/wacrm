'use client'

// Add / edit a product in a side drawer. Saves through /api/catalog/products.

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { ProductRow } from '@/lib/catalog/core'

interface FormState {
  title: string
  retailer_id: string
  description: string
  price: string
  sale_price: string
  stock_qty: string
  availability: 'in stock' | 'out of stock'
  status: 'active' | 'draft' | 'archived'
  image_url: string
  extra_images: string
  product_url: string
  brand: string
  category: string
}

const EMPTY: FormState = {
  title: '',
  retailer_id: '',
  description: '',
  price: '',
  sale_price: '',
  stock_qty: '',
  availability: 'in stock',
  status: 'active',
  image_url: '',
  extra_images: '',
  product_url: '',
  brand: '',
  category: '',
}

const rupees = (paise: number | null) => (paise === null ? '' : String(paise / 100))

function fromProduct(p: ProductRow): FormState {
  return {
    title: p.title,
    retailer_id: p.retailer_id,
    description: p.description,
    price: rupees(p.price_paise),
    sale_price: rupees(p.sale_price_paise),
    stock_qty: p.stock_qty === null ? '' : String(p.stock_qty),
    availability: p.availability,
    status: p.status,
    image_url: p.image_url ?? '',
    extra_images: (p.additional_image_urls ?? []).join('\n'),
    product_url: p.product_url ?? '',
    brand: p.brand ?? '',
    category: p.category ?? '',
  }
}

const selectCls =
  'h-9 w-full rounded-xl border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

export function ProductSheet({
  open,
  onOpenChange,
  product,
  canEdit,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = add a new product. */
  product: ProductRow | null
  canEdit: boolean
  /** The saved product, so the list can show it right away. */
  onSaved: (product?: ProductRow) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load the product into the form each time the drawer opens (derived-state
  // pattern: no effect, so the form never flashes stale values).
  const openKey = open ? (product?.id ?? 'new') : null
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  if (openKey !== loadedKey) {
    setLoadedKey(openKey)
    if (openKey) setForm(product ? fromProduct(product) : EMPTY)
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const tracked = form.stock_qty.trim() !== ''

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/catalog/upload', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      set('image_url', json.url as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!form.title.trim()) return toast.error('Add a product name')
    if (!form.price.trim()) return toast.error('Add a price')
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        price: form.price,
        sale_price: form.sale_price,
        stock_qty: form.stock_qty.trim() === '' ? null : form.stock_qty,
        availability: form.availability,
        status: form.status,
        image_url: form.image_url,
        additional_image_urls: form.extra_images
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
        product_url: form.product_url,
        brand: form.brand,
        category: form.category,
        ...(product ? {} : { retailer_id: form.retailer_id }),
      }
      const res = await fetch(product ? `/api/catalog/products/${product.id}` : '/api/catalog/products', {
        method: product ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not save the product')
      toast.success(product ? 'Product updated' : 'Product added')
      onSaved(json.product as ProductRow | undefined)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-popover border-border text-popover-foreground w-full p-0 sm:max-w-lg">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-border/50 border-b p-4">
            <SheetTitle className="text-popover-foreground">{product ? 'Edit product' : 'Add product'}</SheetTitle>
            <SheetDescription className="text-muted-foreground text-xs">
              Shown to customers when you share your catalog on WhatsApp.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <div className="flex items-center gap-3">
                <div className="bg-muted border-border flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
                  {form.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.image_url} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="text-muted-foreground size-6" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!canEdit || uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                      {form.image_url ? 'Replace' : 'Upload'}
                    </Button>
                    {form.image_url && (
                      <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => set('image_url', '')}>
                        <X className="size-3.5" /> Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">PNG, JPG or WebP, up to 5 MB. Square photos look best.</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    void upload(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
              <Input
                value={form.image_url}
                onChange={(e) => set('image_url', e.target.value)}
                placeholder="…or paste a photo link (https://…)"
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={150} disabled={!canEdit} placeholder="Blue cotton kurta" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price (₹) *</Label>
                <Input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} disabled={!canEdit} placeholder="1299" />
              </div>
              <div className="space-y-1.5">
                <Label>Sale price (₹)</Label>
                <Input inputMode="decimal" value={form.sale_price} onChange={(e) => set('sale_price', e.target.value)} disabled={!canEdit} placeholder="optional" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} maxLength={5000} disabled={!canEdit} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stock</Label>
                <Input
                  inputMode="numeric"
                  value={form.stock_qty}
                  onChange={(e) => set('stock_qty', e.target.value.replace(/[^\d]/g, ''))}
                  disabled={!canEdit}
                  placeholder="leave empty if not tracked"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Availability</Label>
                <select
                  className={selectCls}
                  value={tracked ? (Number(form.stock_qty) > 0 ? 'in stock' : 'out of stock') : form.availability}
                  onChange={(e) => set('availability', e.target.value as FormState['availability'])}
                  disabled={!canEdit || tracked}
                >
                  <option value="in stock">In stock</option>
                  <option value="out of stock">Out of stock</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => set('category', e.target.value)} disabled={!canEdit} placeholder="Clothing" />
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} disabled={!canEdit} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU {product ? '(fixed)' : '(optional)'}</Label>
                <Input
                  value={form.retailer_id}
                  onChange={(e) => set('retailer_id', e.target.value)}
                  disabled={!canEdit || !!product}
                  placeholder={product ? undefined : 'made from the name'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className={selectCls} value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])} disabled={!canEdit}>
                  <option value="active">Active (on WhatsApp)</option>
                  <option value="draft">Draft (hidden)</option>
                  <option value="archived">Archived (hidden)</option>
                </select>
              </div>
            </div>

            <details className="border-border rounded-xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">More options</summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label>Product link</Label>
                  <Input value={form.product_url} onChange={(e) => set('product_url', e.target.value)} disabled={!canEdit} placeholder="https://yourshop.com/kurta" />
                  <p className="text-muted-foreground text-xs">Where a customer can read more. Defaults to our site if empty.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Extra photo links (one per line)</Label>
                  <Textarea value={form.extra_images} onChange={(e) => set('extra_images', e.target.value)} rows={3} disabled={!canEdit} />
                </div>
              </div>
            </details>
          </div>

          <SheetFooter className="border-border/50 flex-row justify-end gap-2 border-t p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={!canEdit || saving}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {product ? 'Save changes' : 'Add product'}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
