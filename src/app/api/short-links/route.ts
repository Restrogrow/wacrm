// /api/short-links — tracked short links (/l/<code>).
//
//   GET  → links with click stats                     (any member)
//   POST { target_url, label?, code?, utm_* } → create (admins)
//
// A link can only be created by an authenticated admin; the public redirect
// route serves nothing that is not in this table. Targets must be public
// http(s) pages (see lib/short-links/core.ts) and their host must resolve to
// public addresses.

import { NextResponse } from 'next/server'

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { publicOrigin } from '@/lib/public-origin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  generateCode,
  MAX_LINKS_PER_ACCOUNT,
  normalizeCustomCode,
  sanitizeUtmValue,
  shortUrl,
  validateTargetUrl,
} from '@/lib/short-links/core'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'

const COLUMNS =
  'id, code, target_url, label, utm_source, utm_medium, utm_campaign, is_active, total_clicks, last_clicked_at, created_at'

type LinkRow = {
  id: string
  code: string
  target_url: string
  label: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  is_active: boolean
  total_clicks: number
  last_clicked_at: string | null
  created_at: string
}

function istDay(back = 0): string {
  return new Date(Date.now() + 5.5 * 3600_000 - back * 86_400_000).toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const db = supabaseAdmin()
    const { data, error } = await db
      .from('short_links')
      .select(COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .limit(MAX_LINKS_PER_ACCOUNT)
    // Table missing (migration 073 not applied) reads as "not available".
    if (error) return NextResponse.json({ available: false, links: [] })

    const links = (data ?? []) as LinkRow[]
    const ids = links.map((l) => l.id)
    const stats = new Map<string, { clicks30: number; series: number[]; referrers: Map<string, number>; devices: Record<string, number> }>()
    for (const id of ids) stats.set(id, { clicks30: 0, series: Array(30).fill(0), referrers: new Map(), devices: {} })

    if (ids.length > 0) {
      const from = istDay(29)
      const { data: rows } = await db
        .from('short_link_daily')
        .select('link_id, day, device, referrer_host, clicks')
        .in('link_id', ids)
        .gte('day', from)
        .limit(20000)
      const start = new Date(`${from}T00:00:00Z`).getTime()
      for (const r of (rows ?? []) as { link_id: string; day: string; device: string; referrer_host: string; clicks: number }[]) {
        const s = stats.get(r.link_id)
        if (!s || r.device === 'bot') continue // previews and crawlers are not customers
        s.clicks30 += r.clicks
        const idx = Math.round((new Date(`${r.day}T00:00:00Z`).getTime() - start) / 86_400_000)
        if (idx >= 0 && idx < 30) s.series[idx] += r.clicks
        s.devices[r.device] = (s.devices[r.device] ?? 0) + r.clicks
        const ref = r.referrer_host || 'Direct / messaging apps'
        s.referrers.set(ref, (s.referrers.get(ref) ?? 0) + r.clicks)
      }
    }

    const origin = publicOrigin()
    return NextResponse.json({
      available: true,
      limit: MAX_LINKS_PER_ACCOUNT,
      links: links.map((l) => {
        const s = stats.get(l.id)!
        return {
          ...l,
          short_url: shortUrl(origin, l.code),
          clicks_30d: s.clicks30,
          series: s.series,
          devices: s.devices,
          top_referrers: [...s.referrers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([host, clicks]) => ({ host, clicks })),
        }
      }),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')
    const limit = checkRateLimit(`short-link-create:${ctx.userId}`, { limit: 30, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>

    const target = validateTargetUrl(b.target_url)
    if (!target.ok) return NextResponse.json({ error: target.error }, { status: 400 })
    // The host must also RESOLVE to public addresses (blocks DNS names that point inside a network).
    if (!(await isDeliverableUrl(target.url))) {
      return NextResponse.json({ error: 'That website could not be reached or points to a private address.' }, { status: 400 })
    }

    const label = typeof b.label === 'string' ? b.label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : ''

    let customCode: string | null = null
    if (typeof b.code === 'string' && b.code.trim()) {
      customCode = normalizeCustomCode(b.code)
      if (!customCode) {
        return NextResponse.json({ error: 'Custom codes use 3 to 32 letters, numbers or hyphens.' }, { status: 400 })
      }
    }

    const db = supabaseAdmin()
    const { count } = await db.from('short_links').select('id', { count: 'exact', head: true }).eq('account_id', ctx.accountId)
    if ((count ?? 0) >= MAX_LINKS_PER_ACCOUNT) {
      return NextResponse.json({ error: `You can keep up to ${MAX_LINKS_PER_ACCOUNT} short links. Delete one you no longer use.` }, { status: 400 })
    }

    const base = {
      account_id: ctx.accountId,
      target_url: target.url,
      label,
      utm_source: sanitizeUtmValue(b.utm_source),
      utm_medium: sanitizeUtmValue(b.utm_medium),
      utm_campaign: sanitizeUtmValue(b.utm_campaign),
      created_by: ctx.userId,
    }

    for (let attempt = 0; attempt < (customCode ? 1 : 6); attempt++) {
      const code = customCode ?? generateCode()
      const { data, error } = await db.from('short_links').insert({ ...base, code }).select(COLUMNS).single()
      if (!error && data) {
        return NextResponse.json({ link: { ...data, short_url: shortUrl(publicOrigin(), code), clicks_30d: 0, series: Array(30).fill(0), devices: {}, top_referrers: [] } }, { status: 201 })
      }
      if (error?.code === '23505') {
        if (customCode) return NextResponse.json({ error: 'That custom code is already taken. Try another.' }, { status: 409 })
        continue
      }
      console.error('[short-link] insert failed:', error?.message)
      return NextResponse.json({ error: 'Could not create the link. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Could not create the link. Please try again.' }, { status: 500 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
