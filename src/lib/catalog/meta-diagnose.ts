// Explain why Meta refused a product / product-list message, and check the
// whole catalog setup on demand.
//
// Meta answers a bad product message with a generic "(#131009) Parameter
// value is not valid". The usual causes are a sending number that isn't in
// the WhatsApp Business Account the catalog is connected to, a catalog that
// isn't connected at all, or products Meta doesn't have (yet) or hasn't
// approved. This asks Meta and turns the answer into plain sentences.
// Server-only. Never logs the token.

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface CatalogFacts {
  /** Whether the sending phone number is in the saved WABA; null when unknown. */
  phoneInWaba?: boolean | null
  /** Catalogs connected to the WABA, or null when Meta didn't say. */
  connectedCatalogIds: string[] | null
  /** Requested products Meta found, with their review status. Null when unknown. */
  found: { retailer_id: string; review_status?: string | null }[] | null
}

/** Pure: the facts → a message for the agent, or null when nothing looks wrong. */
export function explainProductSendFailure(catalogId: string, requested: string[], facts: CatalogFacts): string | null {
  if (facts.phoneInWaba === false) {
    return 'The WhatsApp number Repeat Grow sends from is not in the WhatsApp Business Account saved in Settings → WhatsApp, so Meta looks in the wrong catalog. Reconnect WhatsApp with the number your catalog is connected to.'
  }
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
    return (await res.json().catch(() => null)) as Record<string, unknown> | null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const dataOf = (j: Record<string, unknown> | null): Record<string, unknown>[] | null =>
  j && !j.error && Array.isArray(j.data) ? (j.data as Record<string, unknown>[]) : null
const errorOf = (j: Record<string, unknown> | null): string | null =>
  !j ? 'No answer from Meta' : j.error ? String((j.error as { message?: unknown }).message ?? 'Meta error') : null

/** Ask Meta about the number, catalog and products. Never throws; unknowns stay null. */
export async function fetchCatalogFacts(
  token: string,
  wabaId: string | null,
  catalogId: string,
  retailerIds: string[],
  phoneNumberId?: string,
): Promise<CatalogFacts> {
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds } }))
  const [numbers, connected, products] = await Promise.all([
    wabaId && phoneNumberId ? graphGet(`${GRAPH}/${wabaId}/phone_numbers?fields=id`, token) : Promise.resolve(null),
    wabaId ? graphGet(`${GRAPH}/${wabaId}/product_catalogs?fields=id`, token) : Promise.resolve(null),
    graphGet(`${GRAPH}/${catalogId}/products?fields=retailer_id,review_status&limit=50&filter=${filter}`, token),
  ])
  const numberRows = dataOf(numbers)
  const connectedRows = dataOf(connected)
  const productRows = dataOf(products)
  return {
    phoneInWaba: numberRows && phoneNumberId ? numberRows.some((n) => String(n.id) === phoneNumberId) : null,
    connectedCatalogIds: connectedRows ? connectedRows.map((c) => String(c.id)) : null,
    found: productRows
      ? productRows.map((p) => ({
          retailer_id: String(p.retailer_id ?? ''),
          review_status: typeof p.review_status === 'string' ? p.review_status : null,
        }))
      : null,
  }
}

// ------------------------------------------------------------
// "Check catalog connection" (Orders & payments)
// ------------------------------------------------------------

export interface SetupCheck {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  /** A one-click fix the page can offer for this check. */
  fix?: 'enable_catalog_cart'
}

/**
 * Turn on "show catalog" and "cart" for the phone number. Meta keeps these
 * per number; without them product messages can fail with "product not found".
 */
export async function enableCatalogAndCart(creds: { phoneNumberId: string; accessToken: string }): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${GRAPH}/${creds.phoneNumberId}/whatsapp_commerce_settings?is_catalog_visible=true&is_cart_enabled=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    })
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string; error_user_msg?: string } }
    if (!res.ok || json.error || json.success === false) {
      return { ok: false, message: json.error?.error_user_msg || json.error?.message || `Meta returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not reach Meta' }
  }
}

/** Every link in the chain a product message needs, as Meta sees it. */
export async function runCatalogSetupChecks(
  creds: { phoneNumberId: string; accessToken: string; wabaId?: string | null },
  catalogId: string | null,
): Promise<SetupCheck[]> {
  const token = creds.accessToken
  const wabaId = creds.wabaId ?? null
  const checks: SetupCheck[] = []

  const phone = await graphGet(`${GRAPH}/${creds.phoneNumberId}?fields=display_phone_number,verified_name`, token)
  const phoneErr = errorOf(phone)
  checks.push(
    phoneErr
      ? { label: 'Sending number', status: 'fail', detail: `Meta can't read phone number ID ${creds.phoneNumberId}: ${phoneErr}` }
      : {
          label: 'Sending number',
          status: 'ok',
          detail: `${String(phone!.display_phone_number ?? '?')} (${String(phone!.verified_name ?? 'no name')}), phone number ID ${creds.phoneNumberId}`,
        },
  )

  if (!wabaId) {
    checks.push({ label: 'WhatsApp Business Account', status: 'warn', detail: 'No WhatsApp Business Account ID is saved. Reconnect WhatsApp in Settings → WhatsApp.' })
  } else {
    const [waba, numbers, catalogs] = await Promise.all([
      graphGet(`${GRAPH}/${wabaId}?fields=name`, token),
      graphGet(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number`, token),
      graphGet(`${GRAPH}/${wabaId}/product_catalogs?fields=id,name`, token),
    ])
    const numberRows = dataOf(numbers)
    const wabaName = errorOf(waba) ? '' : ` "${String(waba!.name ?? '')}"`
    if (!numberRows) {
      checks.push({ label: 'Number is in the account', status: 'warn', detail: `Couldn't list numbers of account ${wabaId}${wabaName}: ${errorOf(numbers)}` })
    } else {
      const inWaba = numberRows.some((n) => String(n.id) === creds.phoneNumberId)
      checks.push({
        label: 'Number is in the account',
        status: inWaba ? 'ok' : 'fail',
        detail: inWaba
          ? `Account ${wabaId}${wabaName}`
          : `The sending number is NOT in account ${wabaId}${wabaName}. That account has: ${numberRows.map((n) => String(n.display_phone_number)).join(', ') || 'no numbers'}. Reconnect WhatsApp with the right number.`,
      })
    }
    const catalogRows = dataOf(catalogs)
    if (!catalogId) {
      checks.push({ label: 'Catalog connected', status: 'fail', detail: 'No catalog ID is saved on this page.' })
    } else if (!catalogRows) {
      checks.push({ label: 'Catalog connected', status: 'warn', detail: `Couldn't list catalogs of account ${wabaId}: ${errorOf(catalogs)}` })
    } else {
      const ok = catalogRows.some((c) => String(c.id) === catalogId)
      checks.push({
        label: 'Catalog connected',
        status: ok ? 'ok' : 'fail',
        detail: ok
          ? `Catalog ${catalogId} is connected to this account.`
          : `Catalog ${catalogId} is not connected to account ${wabaId}. Connected: ${catalogRows.map((c) => `${String(c.name ?? '')} (${String(c.id)})`).join(', ') || 'none'}. Connect it in WhatsApp Manager → Catalog.`,
      })
    }
  }

  const commerce = await graphGet(`${GRAPH}/${creds.phoneNumberId}/whatsapp_commerce_settings`, token)
  const commerceRow = dataOf(commerce)?.[0]
  const allOn = !!commerceRow?.is_catalog_visible && !!commerceRow?.is_cart_enabled
  checks.push(
    commerceRow
      ? {
          label: 'Catalog and cart on this number',
          status: allOn ? 'ok' : 'warn',
          detail: `Catalog shown: ${commerceRow.is_catalog_visible ? 'yes' : 'no'}, cart: ${commerceRow.is_cart_enabled ? 'on' : 'off'}.`,
          ...(allOn ? {} : { fix: 'enable_catalog_cart' as const }),
        }
      : {
          label: 'Catalog and cart on this number',
          status: 'warn',
          detail: `Not set up on this number yet (${errorOf(commerce) ?? 'Meta has no settings'}). Product messages may fail until they are on.`,
          fix: 'enable_catalog_cart',
        },
  )

  if (catalogId) {
    const products = await graphGet(`${GRAPH}/${catalogId}/products?fields=retailer_id,review_status&limit=10`, token)
    const rows = dataOf(products)
    checks.push(
      rows
        ? {
            label: 'Products Meta sees',
            status: rows.length ? 'ok' : 'warn',
            detail: rows.length
              ? rows.map((p) => `${String(p.retailer_id)} (review: ${p.review_status ? String(p.review_status) : 'not reported by Meta'})`).join(', ')
              : 'The catalog is empty.',
          }
        : { label: 'Products Meta sees', status: 'fail', detail: `Couldn't read the catalog: ${errorOf(products)}` },
    )
  }
  return checks
}
