// ============================================================
// WhatsApp spend & Meta billing status. Server-only.
//
// Meta bills each business directly (their own card in Meta Business
// Settings); apps can't add a card or pay. What we can show:
//
//   - spend and message volume per day and per pricing category, from
//     the WABA's pricing_analytics (per-message pricing), falling back
//     to conversation_analytics on accounts/API versions without it;
//   - the WABA currency and whether a payment method is linked
//     (primary_funding_id, when Meta returns it);
//   - payment problems: Meta's health_status errors that mention
//     payment / billing, and messages that failed with 131042.
//
// Meta's numbers lag a few hours and are approximate until Meta's
// invoice; the page says so.
// ============================================================

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface SpendPoint {
  /** Unix seconds (UTC) the bucket starts. */
  start: number
  volume: number
  cost: number
  category: string
  /** REGULAR (billable), FREE_CUSTOMER_SERVICE, FREE_ENTRY_POINT, … */
  pricingType: string | null
}

export interface HealthError {
  code: number | null
  description: string
  solution: string | null
}

export interface WabaBilling {
  name: string | null
  currency: string | null
  /** true / false when Meta told us; null when it didn't say. */
  fundingLinked: boolean | null
  canSend: string | null
  healthErrors: HealthError[]
}

async function graphGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `WhatsApp returned ${res.status}`)
  return json
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Name, currency, payment method and health of the Business Account. Optional fields fail soft. */
export async function fetchWabaBilling(wabaId: string, token: string): Promise<WabaBilling> {
  let info: Record<string, unknown>
  let fundingKnown = true
  try {
    info = await graphGet(`${wabaId}?fields=name,currency,primary_funding_id`, token)
  } catch {
    fundingKnown = false
    info = await graphGet(`${wabaId}?fields=name,currency`, token)
  }

  let canSend: string | null = null
  let healthErrors: HealthError[] = []
  try {
    const h = (await graphGet(`${wabaId}?fields=health_status`, token)).health_status as
      | {
          can_send_message?: string
          entities?: { errors?: { error_code?: number; error_description?: string; possible_solution?: string }[] }[]
        }
      | undefined
    canSend = h?.can_send_message ?? null
    healthErrors = (h?.entities ?? [])
      .flatMap((e) => e.errors ?? [])
      // 138024 / 138025 are SIP-calling notices; Repeat Grow calls over WebRTC.
      .filter((e) => e.error_code !== 138024 && e.error_code !== 138025)
      .map((e) => ({
        code: e.error_code ?? null,
        description: e.error_description ?? 'Unknown problem',
        solution: e.possible_solution ?? null,
      }))
  } catch {
    // health_status not available on this API version / token.
  }

  return {
    name: (info.name as string) ?? null,
    currency: (info.currency as string) ?? null,
    fundingLinked: fundingKnown ? !!info.primary_funding_id : null,
    canSend,
    healthErrors: dedupeErrors(healthErrors),
  }
}

function dedupeErrors(errors: HealthError[]): HealthError[] {
  const seen = new Set<string>()
  return errors.filter((e) => {
    const key = `${e.code}|${e.description}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Health errors that are about paying Meta. */
export function isPaymentError(e: HealthError): boolean {
  return /payment|billing|funding|credit|card|invoice|overdue/i.test(`${e.description} ${e.solution ?? ''}`)
}

/** Parse pricing_analytics data points (per-message pricing). */
export function parsePricingAnalytics(json: Record<string, unknown>): SpendPoint[] {
  const block = json.pricing_analytics as { data?: { data_points?: Record<string, unknown>[] }[] } | undefined
  return (block?.data ?? []).flatMap((d) =>
    (d.data_points ?? []).map((p) => ({
      start: num(p.start),
      volume: num(p.volume),
      cost: num(p.cost),
      category: String(p.pricing_category ?? 'UNKNOWN').toUpperCase(),
      pricingType: p.pricing_type ? String(p.pricing_type).toUpperCase() : null,
    })),
  )
}

/** Parse conversation_analytics data points (older conversation-based pricing). */
export function parseConversationAnalytics(json: Record<string, unknown>): SpendPoint[] {
  const block = json.conversation_analytics as { data?: { data_points?: Record<string, unknown>[] }[] } | undefined
  return (block?.data ?? []).flatMap((d) =>
    (d.data_points ?? []).map((p) => ({
      start: num(p.start),
      volume: num(p.conversation),
      cost: num(p.cost),
      category: String(p.conversation_category ?? 'UNKNOWN').toUpperCase(),
      pricingType: p.conversation_type
        ? String(p.conversation_type).toUpperCase() === 'REGULAR'
          ? 'REGULAR'
          : 'FREE'
        : null,
    })),
  )
}

/**
 * Daily spend for [fromSec, toSec). Returns the points and which Meta
 * API answered; throws only when neither did.
 */
export async function fetchSpend(
  wabaId: string,
  token: string,
  fromSec: number,
  toSec: number,
): Promise<{ points: SpendPoint[]; source: 'pricing' | 'conversation' }> {
  try {
    const json = await graphGet(
      `${wabaId}?fields=pricing_analytics.start(${fromSec}).end(${toSec}).granularity(DAILY)` +
        `.dimensions(${encodeURIComponent('["PRICING_CATEGORY","PRICING_TYPE"]')})`,
      token,
    )
    return { points: parsePricingAnalytics(json), source: 'pricing' }
  } catch (pricingErr) {
    try {
      const json = await graphGet(
        `${wabaId}?fields=conversation_analytics.start(${fromSec}).end(${toSec}).granularity(DAILY)` +
          `.dimensions(${encodeURIComponent('["CONVERSATION_CATEGORY","CONVERSATION_TYPE"]')})`,
        token,
      )
      return { points: parseConversationAnalytics(json), source: 'conversation' }
    } catch {
      throw pricingErr
    }
  }
}

/** Calendar day (YYYY-MM-DD) of a unix time in a time zone. */
export function dayInZone(unixSec: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(unixSec * 1000),
    )
  } catch {
    return new Date(unixSec * 1000).toISOString().slice(0, 10)
  }
}

export interface SpendSummary {
  total: number
  volume: number
  billableVolume: number
  freeVolume: number
  byCategory: { category: string; volume: number; billable: number; cost: number }[]
  daily: { day: string; cost: number; volume: number }[]
}

export function summarizeSpend(points: SpendPoint[], timeZone: string): SpendSummary {
  const byCategory = new Map<string, { category: string; volume: number; billable: number; cost: number }>()
  const daily = new Map<string, { day: string; cost: number; volume: number }>()
  let total = 0
  let volume = 0
  let billableVolume = 0

  for (const p of points) {
    total += p.cost
    volume += p.volume
    const billable = p.pricingType === null || p.pricingType === 'REGULAR'
    if (billable) billableVolume += p.volume

    const c = byCategory.get(p.category) ?? { category: p.category, volume: 0, billable: 0, cost: 0 }
    c.volume += p.volume
    if (billable) c.billable += p.volume
    c.cost += p.cost
    byCategory.set(p.category, c)

    const day = dayInZone(p.start, timeZone)
    const d = daily.get(day) ?? { day, cost: 0, volume: 0 }
    d.cost += p.cost
    d.volume += p.volume
    daily.set(day, d)
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    total: round(total),
    volume,
    billableVolume,
    freeVolume: volume - billableVolume,
    byCategory: [...byCategory.values()]
      .map((c) => ({ ...c, cost: round(c.cost) }))
      .sort((a, b) => b.cost - a.cost || b.volume - a.volume),
    daily: [...daily.values()].map((d) => ({ ...d, cost: round(d.cost) })).sort((a, b) => a.day.localeCompare(b.day)),
  }
}

/** Group "code: detail" / numeric error codes into counts, most common first. */
export function groupFailures(codes: (number | null)[]): { code: number | null; count: number }[] {
  const counts = new Map<number | null, number>()
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
}

/** Leading Meta error code from a broadcast recipient's error_message ("131049: …"). */
export function codeFromErrorMessage(message: string | null | undefined): number | null {
  const m = message?.match(/^\s*(?:Retrying:\s*)?\(?#?(\d{3,6})\)?/)
  return m ? Number(m[1]) : null
}

// ---- Cost per broadcast -------------------------------------------------

/** Average cost per paid message by category, from Meta's spend summary. */
export function ratesByCategory(byCategory: SpendSummary['byCategory']): Record<string, number> {
  const rates: Record<string, number> = {}
  for (const c of byCategory) {
    if (c.billable > 0 && c.cost > 0) rates[c.category] = c.cost / c.billable
  }
  return rates
}

export interface BroadcastForCost {
  id: string
  name: string
  createdAt: string
  status: string
  templateName: string | null
  /** The template's category (MARKETING / UTILITY / …), if known. */
  templateCategory: string | null
  recipients: number
  sent: number
  delivered: number
  read: number
  failed: number
}

export interface PricedCount {
  broadcastId: string
  category: string
  /** Recipients Meta sent pricing for. */
  priced: number
  /** Of those, the ones Meta charges for. */
  billable: number
}

export interface BroadcastCost extends BroadcastForCost {
  /** Messages Meta charges for (reported, plus delivered ones not reported yet). */
  paid: number
  /** Estimated cost, or null when there is no rate to price it with. */
  cost: number | null
}

/**
 * Estimate each broadcast's Meta cost: billable messages per category
 * (from status webhooks) × the account's average cost per paid message in
 * that category. Delivered messages Meta hasn't sent pricing for yet
 * (older broadcasts, before migration 086) count as billable in the
 * template's category — marketing messages are charged on delivery.
 */
export function estimateBroadcastCosts(
  broadcasts: BroadcastForCost[],
  priced: PricedCount[],
  rates: Record<string, number>,
): BroadcastCost[] {
  const byBroadcast = new Map<string, PricedCount[]>()
  for (const p of priced) {
    const list = byBroadcast.get(p.broadcastId) ?? []
    list.push(p)
    byBroadcast.set(p.broadcastId, list)
  }

  return broadcasts.map((b) => {
    const counts = byBroadcast.get(b.id) ?? []
    const pricedTotal = counts.reduce((n, c) => n + c.priced, 0)
    const unpricedDelivered = Math.max(0, b.delivered - pricedTotal)
    const fallbackCategory = (b.templateCategory ?? 'MARKETING').toUpperCase()

    let paid = 0
    let cost = 0
    let missingRate = false
    const add = (category: string, n: number) => {
      if (n <= 0) return
      paid += n
      const rate = rates[category.toUpperCase()]
      if (rate === undefined) missingRate = true
      else cost += n * rate
    }
    for (const c of counts) add(c.category, c.billable)
    add(fallbackCategory, unpricedDelivered)

    return {
      ...b,
      paid,
      cost: paid === 0 ? 0 : missingRate && cost === 0 ? null : Math.round(cost * 100) / 100,
    }
  })
}
