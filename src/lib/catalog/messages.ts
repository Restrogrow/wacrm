// ============================================================
// WhatsApp interactive `product_list` (multi-product) message builder
// and the validation around it. Pure functions.
// Limits (Meta): up to 30 products in total, up to 10 sections, section
// titles up to 24 characters, header text up to 60, body up to 1024.
// https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-multi-product-messages
// ============================================================

export const MAX_PRODUCTS_PER_LIST = 30
export const MAX_SECTIONS = 10

export interface ProductListSection {
  title: string
  retailer_ids: string[]
}

export class ProductListError extends Error {}

const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

/** Normalise raw retailer ids: trim, drop blanks, de-duplicate, keep order. */
export function normaliseRetailerIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    const id = v.trim()
    if (!id || id.length > 100 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Group products into sections by category (first-seen order). Everything
 * beyond MAX_SECTIONS categories falls into the last section so nothing is dropped.
 */
export function groupIntoSections(
  items: { retailer_id: string; category?: string | null }[],
  fallbackTitle = 'Products',
): ProductListSection[] {
  const sections = new Map<string, string[]>()
  for (const it of items) {
    const title = clean(it.category || fallbackTitle, 24) || fallbackTitle
    if (!sections.has(title) && sections.size >= MAX_SECTIONS) {
      const last = [...sections.keys()].pop() as string
      sections.get(last)!.push(it.retailer_id)
      continue
    }
    if (!sections.has(title)) sections.set(title, [])
    sections.get(title)!.push(it.retailer_id)
  }
  return [...sections].map(([title, retailer_ids]) => ({ title, retailer_ids }))
}

export function validateProductList(sections: ProductListSection[]): void {
  if (!sections.length) throw new ProductListError('Pick at least one product.')
  if (sections.length > MAX_SECTIONS) throw new ProductListError(`A list can have up to ${MAX_SECTIONS} sections.`)
  const all = sections.flatMap((s) => s.retailer_ids)
  if (!all.length) throw new ProductListError('Pick at least one product.')
  if (all.length > MAX_PRODUCTS_PER_LIST) throw new ProductListError(`WhatsApp allows up to ${MAX_PRODUCTS_PER_LIST} products in one message.`)
  if (new Set(all).size !== all.length) throw new ProductListError('A product appears twice in the list.')
  for (const s of sections) {
    if (!s.title.trim()) throw new ProductListError('Every section needs a title.')
    if (s.title.length > 24) throw new ProductListError('Section titles are 24 characters at most.')
    if (!s.retailer_ids.length) throw new ProductListError('A section has no products.')
  }
}

/** The `interactive` message body for `type: 'product_list'`. */
export function buildProductListMessage(args: {
  catalogId: string
  header?: string
  body: string
  footer?: string
  sections: ProductListSection[]
}) {
  if (!args.catalogId) throw new ProductListError('Add your catalog ID in Orders & payments first.')
  validateProductList(args.sections)
  const header = clean(args.header ?? '', 60) || 'Our products'
  const body = clean(args.body, 1024) || 'Take a look and order right here on WhatsApp.'
  const footer = args.footer ? clean(args.footer, 60) : ''
  return {
    type: 'interactive',
    interactive: {
      type: 'product_list',
      header: { type: 'text', text: header },
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        catalog_id: args.catalogId,
        sections: args.sections.map((s) => ({
          title: clean(s.title, 24),
          product_items: s.retailer_ids.map((id) => ({ product_retailer_id: id })),
        })),
      },
    },
  }
}

// ---------- collections ----------

export interface CollectionInput {
  name: string
  retailer_ids: string[]
}

export function parseCollectionInput(body: unknown): { ok: true; value: CollectionInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' }
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? clean(b.name, 24) : ''
  if (!name) return { ok: false, error: 'Give the collection a name (up to 24 characters).' }
  const retailer_ids = normaliseRetailerIds(b.retailer_ids)
  if (!retailer_ids.length) return { ok: false, error: 'Pick at least one product.' }
  if (retailer_ids.length > MAX_PRODUCTS_PER_LIST) {
    return { ok: false, error: `A collection can have up to ${MAX_PRODUCTS_PER_LIST} products (a WhatsApp limit).` }
  }
  return { ok: true, value: { name, retailer_ids } }
}
