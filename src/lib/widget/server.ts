// Server-side helpers for the public widget endpoints. Reads use the
// service-role client (the tables have no public policies) but only ever
// return the sanitised public subset.

import { randomInt } from 'node:crypto'

import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isOpenNow, rowToSettings } from '@/lib/business-hours/hours'
import { PUBLIC_ID_RE, toPublicConfig, type PublicWidgetConfig, type WidgetConfig } from './core'

/** CORS for the three public widget responses only (script, config, event). */
export const WIDGET_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  // The widget response never depends on cookies or the caller's identity.
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export async function loadPublicWidgetConfig(publicId: string): Promise<PublicWidgetConfig> {
  if (!PUBLIC_ID_RE.test(publicId)) return { enabled: false }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('chat_widgets')
    .select('account_id, enabled, phone, position, color, button_label, greeting, prefill_message, hours_aware, offline_text, collect_name')
    .eq('public_id', publicId)
    .maybeSingle()
  if (error || !data) return { enabled: false }

  const row = data as WidgetConfig & { account_id: string }
  let open: boolean | null = null
  if (row.hours_aware) {
    const { data: hours } = await db
      .from('business_hours_settings')
      .select('*')
      .eq('account_id', row.account_id)
      .maybeSingle()
    open = isOpenNow(rowToSettings(hours as Record<string, unknown> | null))
  }
  return toPublicConfig(row, open)
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** Unguessable public id for the embed snippet (letters and digits only). */
export function generatePublicId(length = 16): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ID_ALPHABET[randomInt(ID_ALPHABET.length)]
  return out
}
