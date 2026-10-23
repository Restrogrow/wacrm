// Create Repeat Grow's order webhooks in a WooCommerce store through its
// REST API, using the keys from the one-click authorization. Idempotent:
// webhooks that already point at our URL for a topic are kept (and turned
// back on if paused). Server-only. Never logs keys or secrets.

import { readBodyCapped, safeFetch, UnsafeUrlError } from '@/lib/webhooks/ssrf'

import { WOO_TOPICS } from './config'

export interface WooWebhookSetupResult {
  ok: boolean
  created: string[]
  existing: string[]
  error?: string
}

interface WooWebhook {
  id: number
  topic?: string
  delivery_url?: string
  status?: string
}

export async function setupWooWebhooks(args: {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
  deliveryUrl: string
  webhookSecret: string
}): Promise<WooWebhookSetupResult> {
  const out: WooWebhookSetupResult = { ok: true, created: [], existing: [] }
  const base = `${args.storeUrl.replace(/\/+$/, '')}/wp-json/wc/v3/webhooks`
  const headers = {
    Authorization: `Basic ${Buffer.from(`${args.consumerKey}:${args.consumerSecret}`).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const call = async (url: string, init: RequestInit) => {
    const res = await safeFetch(url, { ...init, headers }, { httpsOnly: true, timeoutMs: 20_000 })
    const bytes = await readBodyCapped(res, 2 * 1024 * 1024).catch(() => new Uint8Array())
    const text = new TextDecoder().decode(bytes)
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, ok: res.ok, json }
  }

  try {
    const list = await call(`${base}?per_page=100&status=all`, { method: 'GET' })
    if (list.status === 401 || list.status === 403) {
      return { ...out, ok: false, error: 'WooCommerce refused the Repeat Grow keys. Connect the store again.' }
    }
    if (!list.ok || !Array.isArray(list.json)) {
      return { ...out, ok: false, error: `Could not read the store's webhooks (HTTP ${list.status}).` }
    }
    const ours = (list.json as WooWebhook[]).filter((w) => w.delivery_url === args.deliveryUrl)

    for (const { topic, adminName } of WOO_TOPICS) {
      const match = ours.find((w) => w.topic === topic)
      if (match) {
        if (match.status !== 'active') {
          await call(`${base}/${match.id}`, { method: 'PUT', body: JSON.stringify({ status: 'active', secret: args.webhookSecret }) })
        }
        out.existing.push(topic)
        continue
      }
      const created = await call(base, {
        method: 'POST',
        body: JSON.stringify({
          name: `Repeat Grow: ${adminName}`,
          topic,
          delivery_url: args.deliveryUrl,
          secret: args.webhookSecret,
          status: 'active',
        }),
      })
      if (!created.ok) {
        return { ...out, ok: false, error: `Could not create the "${adminName}" webhook (HTTP ${created.status}).` }
      }
      out.created.push(topic)
    }
    return out
  } catch (err) {
    if (err instanceof UnsafeUrlError) return { ...out, ok: false, error: err.message }
    return { ...out, ok: false, error: 'Could not reach your store. Check that it is online and uses https.' }
  }
}
