// Meta's review of catalog products. A product only reaches WhatsApp (and can
// be shared in a chat) after Meta approves it, which can take from minutes to
// a day for a new product. The catalog page shows this next to "On WhatsApp".

const GRAPH = 'https://graph.facebook.com/v21.0'

export type ReviewTone = 'ok' | 'wait' | 'bad'

/**
 * Meta's review_status → what the merchant sees, or null when there is
 * nothing to say. Meta often leaves review_status empty even for products
 * that WhatsApp can already send (seen live, Oct 2026), so empty is not
 * treated as "waiting".
 */
export function reviewLabel(status: string | null | undefined): { label: string; tone: ReviewTone } | null {
  switch ((status ?? '').toLowerCase()) {
    case 'approved':
    case 'outdated':
      return { label: 'Approved by Meta', tone: 'ok' }
    case 'rejected':
      return { label: 'Rejected by Meta', tone: 'bad' }
    case 'pending':
      return { label: 'Waiting for Meta review', tone: 'wait' }
    default:
      return null
  }
}

/** retailer_id → review_status ('' when Meta hasn't reviewed it), for the ids Meta knows. Null when Meta can't be read. */
export async function fetchReviewStatuses(token: string, catalogId: string, retailerIds: string[]): Promise<Record<string, string> | null> {
  if (!retailerIds.length) return {}
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds } }))
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${GRAPH}/${catalogId}/products?fields=retailer_id,review_status&limit=100&filter=${filter}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => null)) as { data?: { retailer_id?: string; review_status?: string }[] } | null
    if (!res.ok || !Array.isArray(json?.data)) return null
    const out: Record<string, string> = {}
    for (const row of json.data) if (row.retailer_id) out[row.retailer_id] = row.review_status ?? ''
    return out
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
