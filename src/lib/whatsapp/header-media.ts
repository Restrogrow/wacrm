// ============================================================
// Template media headers: send a WhatsApp media ID, not a link.
// Server-only.
//
// With `{ link }`, Meta downloads the photo / video / document from that
// link on EVERY send. A slow or blocking host makes the message fail
// after we already got a message ID (131053 "Downloading media from
// weblink failed with http code 503"). Instead we download the file
// once, upload it to the number's /media endpoint and send `{ id }`.
// IDs are cached per number + link for 25 days (Meta keeps uploads 30),
// and concurrent sends (broadcasts) share one upload.
//
// Best-effort: if our download or the upload fails, null is returned and
// the caller falls back to the link, exactly as before.
// ============================================================

import { readBodyCapped, safeFetch } from '@/lib/webhooks/ssrf'

const GRAPH = 'https://graph.facebook.com/v21.0'

export type HeaderMediaKind = 'image' | 'video' | 'document'

const LIMITS: Record<HeaderMediaKind, { maxBytes: number; types: string[] }> = {
  image: { maxBytes: 5 * 1024 * 1024, types: ['image/jpeg', 'image/png'] },
  video: { maxBytes: 16 * 1024 * 1024, types: ['video/mp4', 'video/3gpp'] },
  document: {
    maxBytes: 100 * 1024 * 1024,
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
  },
}

/** Hosts often serve files as octet-stream; trust a clear extension then. */
const BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

const ID_TTL_MS = 25 * 24 * 60 * 60 * 1000
/** Don't retry a link that just failed for every recipient of a broadcast. */
const FAILURE_TTL_MS = 10 * 60 * 1000

const cache = new Map<string, { id: string | null; expires: number }>()
const inFlight = new Map<string, Promise<string | null>>()

export function mediaTypeFor(
  kind: HeaderMediaKind,
  contentType: string,
  url: string,
): string | null {
  const allowed = LIMITS[kind].types
  const declared = contentType.split(';')[0].trim().toLowerCase()
  if (allowed.includes(declared)) return declared
  let ext = ''
  try {
    ext = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''
  } catch {
    return null
  }
  const guessed = BY_EXTENSION[ext]
  return guessed && allowed.includes(guessed) ? guessed : null
}

async function downloadAndUpload(
  phoneNumberId: string,
  accessToken: string,
  url: string,
  kind: HeaderMediaKind,
): Promise<string | null> {
  const res = await safeFetch(url, {}, { timeoutMs: 20_000 })
  if (!res.ok) throw new Error(`media link answered ${res.status}`)
  const mime = mediaTypeFor(kind, res.headers.get('content-type') ?? '', url)
  if (!mime) throw new Error(`media link is not a supported ${kind} type`)
  const bytes = await readBodyCapped(res, LIMITS[kind].maxBytes)
  if (bytes.byteLength === 0) throw new Error('media link returned an empty file')

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mime)
  const fileName = new URL(url).pathname.split('/').pop() || `header.${mime.split('/')[1]}`
  form.append('file', new Blob([bytes as BlobPart], { type: mime }), fileName)

  const upload = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  const data = (await upload.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!upload.ok || !data?.id) {
    throw new Error(data?.error?.message ?? `media upload failed (${upload.status})`)
  }
  return data.id
}

/**
 * The WhatsApp media ID for a header link on this number, uploading it
 * if needed. Null when that isn't possible (caller sends the link).
 */
export async function resolveHeaderMediaId(args: {
  phoneNumberId: string
  accessToken: string
  url: string
  kind: HeaderMediaKind
}): Promise<string | null> {
  const { phoneNumberId, accessToken, url, kind } = args
  const key = `${phoneNumberId}|${kind}|${url}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.id

  const pending = inFlight.get(key)
  if (pending) return pending

  const run = downloadAndUpload(phoneNumberId, accessToken, url, kind)
    .then((id) => {
      cache.set(key, { id, expires: Date.now() + ID_TTL_MS })
      return id
    })
    .catch((err) => {
      console.warn(
        '[header-media] sending the link instead:',
        err instanceof Error ? err.message : err,
      )
      cache.set(key, { id: null, expires: Date.now() + FAILURE_TTL_MS })
      return null
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, run)
  return run
}

/** Forget a cached ID (e.g. Meta said it expired). Test hook too. */
export function forgetHeaderMediaId(phoneNumberId: string, kind: HeaderMediaKind, url: string): void {
  cache.delete(`${phoneNumberId}|${kind}|${url}`)
}
