// Explain why Meta refused a product / product-list message.
//
// Meta answers a bad product message with a generic "(#131009) Parameter
// value is not valid". The usual causes are a catalog that isn't connected
// to the WhatsApp Business Account, or products Meta doesn't have (yet) or
// hasn't approved. This asks Meta about both and turns the answer into one
// plain sentence. Server-only. Never logs the token.

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface CatalogFacts {
  /** Catalogs connected to the WABA, or null when Meta didn't say. */
  connectedCatalogIds: string[] | null
  /** Requested products Meta found, with their review status. Null when unknown. */
  found: { retailer_id: string; review_status?: string | null }[] | null
}

/** Pure: the facts → a message for the agent, or null when nothing looks wrong. */
export function explainProductSendFailure(catalogId: string, requested: string[], facts: CatalogFacts): string | null {
  if (facts.connectedCatalogIds && !facts.connectedCatalogIds.includes(catalogId)) {
    return facts.connectedCatalogIds.length
      ? `Catalog ${catalogId} isn't connected to this WhatsApp number's account (connected: ${facts.connectedCatalogIds.join(', ')}). Fix the catalog ID in Orders & payments or connect this catalog in WhatsApp Manager → Catalog.`
      : `No catalog is connected to this WhatsApp number's account. Connect catalog ${catalogId} in WhatsApp Manager → Catalog, then try again.`
  }
  if (facts.found) {
    const byId = new Map(facts.found.map((f) => [f.retailer_id, f]))
    const missing = requested.filter((id) => !byId.has(id))
    if (missing.length) {
      return `Meta can't find ${missing.join(', ')} in your WhatsApp catalog. Sync to WhatsApp, wait a few minutes for Meta to process it, then try again.`
    }
    const notApproved = requested
      .map((id) => byId.get(id)!)
      .filter((f) => f.review_status && !['approved', 'outdated'].includes(f.review_status.toLowerCase()))
    if (notApproved.length) {
      return `Meta hasn't approved ${notApproved.map((f) => `${f.retailer_id} (${f.review_status})`).join(', ')} yet. Products can be shared once Meta approves them in Commerce Manager.`
    }
  }
  return null
}

async function graphGet(url: string, token: string): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as Record<string, unknown> | null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Ask Meta about the catalog and products. Never throws; unknowns stay null. */
export async function fetchCatalogFacts(
  token: string,
  wabaId: string | null,
  catalogId: string,
  retailerIds: string[],
): Promise<CatalogFacts> {
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds } }))
  const [connected, products] = await Promise.all([
    wabaId ? graphGet(`${GRAPH}/${wabaId}/product_catalogs?fields=id`, token) : Promise.resolve(null),
    graphGet(`${GRAPH}/${catalogId}/products?fields=retailer_id,review_status&limit=50&filter=${filter}`, token),
  ])
  const connectedData = connected?.data
  const productData = products?.data
  return {
    connectedCatalogIds: Array.isArray(connectedData) ? connectedData.map((c) => String((c as { id: unknown }).id)) : null,
    found: Array.isArray(productData)
      ? productData.map((p) => {
          const row = p as { retailer_id?: unknown; review_status?: unknown }
          return { retailer_id: String(row.retailer_id ?? ''), review_status: typeof row.review_status === 'string' ? row.review_status : null }
        })
      : null,
  }
}
