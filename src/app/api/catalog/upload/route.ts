// POST /api/catalog/upload — multipart `file`; stores a product photo in the
// public catalog-media bucket and returns its URL. Agents and above.

import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')
    const limit = checkRateLimit(`catalog-upload:${ctx.userId}`, { limit: 60, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const form = await request.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = TYPES[file.type]
    if (!ext) return NextResponse.json({ error: 'Use a PNG, JPG or WebP photo.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo is over 5 MB.' }, { status: 400 })

    const path = `${ctx.accountId}/${randomUUID()}.${ext}`
    const db = supabaseAdmin()
    const { error } = await db.storage
      .from('catalog-media')
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000' })
    if (error) {
      console.error('[catalog] upload failed:', error.message)
      return NextResponse.json({ error: 'Could not upload the photo. Please try again.' }, { status: 500 })
    }
    const { data } = db.storage.from('catalog-media').getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    return toErrorResponse(err)
  }
}
