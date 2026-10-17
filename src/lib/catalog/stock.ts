// ============================================================
// Stock rules shared by the catalog-order flow and the tests.
// Pure functions. The authoritative, atomic stock update lives in SQL
// (apply_order_stock, migration 077); these mirror its maths so the
// chat summary and the database agree.
// ============================================================

export const LOW_STOCK_THRESHOLD = 5

export interface StockProduct {
  retailer_id: string
  title: string
  /** null = stock is not tracked. */
  stock_qty: number | null
  availability?: string | null
}

export interface CartLine {
  retailer_id?: string | null
  quantity: number
}

export interface StockIssue {
  retailer_id: string
  title: string
  wanted: number
  available: number
  kind: 'out' | 'short'
}

/** Compare a cart with tracked stock. Untracked products and unknown ids are never an issue. */
export function checkCartStock(lines: CartLine[], products: Record<string, StockProduct>): StockIssue[] {
  // The same product can appear on two lines; judge the total.
  const wanted = new Map<string, number>()
  for (const l of lines) {
    if (!l.retailer_id) continue
    wanted.set(l.retailer_id, (wanted.get(l.retailer_id) ?? 0) + Math.max(0, Math.floor(l.quantity || 0)))
  }
  const issues: StockIssue[] = []
  for (const [rid, qty] of wanted) {
    const p = products[rid]
    if (!p || p.stock_qty === null) continue
    if (qty <= 0) continue
    const available = Math.max(0, p.stock_qty)
    if (available > 0 && qty <= available) continue
    if (available === 0) issues.push({ retailer_id: rid, title: p.title, wanted: qty, available: 0, kind: 'out' })
    else issues.push({ retailer_id: rid, title: p.title, wanted: qty, available, kind: 'short' })
  }
  return issues
}

/** Lines appended to the order summary the agent sees. */
export function stockIssueLines(issues: StockIssue[]): string[] {
  if (!issues.length) return []
  return [
    '⚠️ Stock check:',
    ...issues.map((i) =>
      i.kind === 'out'
        ? `• ${i.title} (${i.retailer_id}) is out of stock`
        : `• ${i.title} (${i.retailer_id}): ordered ${i.wanted}, only ${i.available} left`,
    ),
  ]
}

/** Same maths as apply_order_stock for a sale. */
export function planSale(stockQty: number, orderedQty: number): { after: number; moved: number } {
  const after = Math.max(stockQty - Math.max(0, orderedQty), 0)
  return { after, moved: stockQty - after }
}

/** Same maths as apply_order_stock for a restock: give back what the sale really took. */
export function planRestock(stockQty: number, soldQty: number): { after: number } {
  return { after: stockQty + Math.max(0, soldQty) }
}

/** True when a sale takes stock from above the threshold to at or below it. */
export function crossedLowStock(before: number, after: number, threshold = LOW_STOCK_THRESHOLD): boolean {
  return before > threshold && after <= threshold
}

/**
 * Idempotency model of the ledger: (order, product, kind) is unique, so a
 * replayed "paid" event never moves stock twice. Used by tests to prove the
 * rule the SQL unique constraint enforces.
 */
export function applyOnce(
  ledger: Set<string>,
  key: { orderId: string; retailerId: string; kind: 'sale' | 'restock' },
): boolean {
  const k = `${key.orderId}|${key.retailerId}|${key.kind}`
  if (ledger.has(k)) return false
  ledger.add(k)
  return true
}
