import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'
import { readBodyCapped, safeFetch, UnsafeUrlError } from '@/lib/webhooks/ssrf'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with an IMAGE header — a plain public
 * URL is not accepted at creation time. This helper turns the template's
 * `header_media_url` (whether the user uploaded a file or pasted a link)
 * into a handle and writes it onto the payload, so both the upload path
 * and the legacy URL path actually succeed.
 *
 * No-op unless the header is an image or video that has a URL but no
 * handle yet. Document handles can follow the same shape.
 */

// Meta's image-header sample limits.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png']
const VIDEO_MAX_BYTES = 16 * 1024 * 1024
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/3gpp']

/**
 * Download a customer-supplied sample media link. The URL must resolve to
 * a public address (no SSRF into our network), the response must declare
 * an allowed media type, and the body is capped while streaming so a huge
 * file can't exhaust memory.
 */
async function fetchSampleMedia(
  url: string,
  allowed: string[],
  maxBytes: number,
  label: string,
  typeLabel: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let res: Response
  try {
    res = await safeFetch(url, {}, { timeoutMs: 15_000 })
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new Error(`${label}: ${err.message}.`)
    throw new Error(`${label}: could not fetch the media link. Make sure it is publicly reachable.`)
  }
  if (!res.ok) throw new Error(`${label}: the media link did not load. It must be publicly reachable.`)

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!allowed.includes(contentType)) {
    throw new Error(`${label}: must be ${typeLabel}.`)
  }
  let bytes: Uint8Array
  try {
    bytes = await readBodyCapped(res, maxBytes)
  } catch {
    throw new Error(`${label}: file is larger than Meta's limit of ${maxBytes / 1024 / 1024} MB.`)
  }
  if (bytes.byteLength === 0) throw new Error(`${label}: the file is empty.`)
  return { bytes, contentType }
}

/**
 * Upload a public image/video URL as a template sample and return the
 * Resumable-Upload handle. Used for every carousel card.
 */
export async function uploadHeaderSample(
  url: string,
  kind: 'image' | 'video',
  accessToken: string,
  label = 'Header',
): Promise<string> {
  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error('Media templates need META_APP_ID set (used for Meta’s Resumable Upload).')
  }
  const allowed = kind === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const max = kind === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  const { bytes, contentType: mimeType } = await fetchSampleMedia(url, allowed, max, label, kind === 'image' ? 'JPEG or PNG' : 'MP4')
  const ext = mimeType.split('/')[1].replace('jpeg', 'jpg').replace('3gpp', '3gp')
  const { handle } = await uploadResumableMedia({ appId, accessToken, fileName: `${kind}.${ext}`, mimeType, bytes })
  return handle
}

/** Make sure every carousel card has a sample handle (uploads the ones missing). */
export async function ensureCarouselHandles(payload: TemplatePayload, accessToken: string): Promise<void> {
  if (!payload.carousel_cards?.length) return
  for (let i = 0; i < payload.carousel_cards.length; i++) {
    const card = payload.carousel_cards[i]
    if (card.header_handle || !card.media_url) continue
    card.header_handle = await uploadHeaderSample(card.media_url, card.header_type, accessToken, `Card ${i + 1}`)
  }
}

export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  if (payload.header_handle) return // already have one
  if (!payload.header_media_url) return // validator already requires url-or-handle
  // Video headers need a handle too: Meta answers a plain header_url with
  // "Invalid parameter".
  if (payload.header_type === 'video') {
    payload.header_handle = await uploadHeaderSample(payload.header_media_url, 'video', accessToken, 'Header video')
    return
  }
  if (payload.header_type !== 'image') return

  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error(
      'Image-header templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the image header.',
    )
  }

  // Fetch the sample image bytes (works for our uploaded chat-media URL
  // and for a manually-pasted public link).
  const { bytes, contentType: mimeType } = await fetchSampleMedia(
    payload.header_media_url,
    ALLOWED_IMAGE_TYPES,
    IMAGE_MAX_BYTES,
    'Header image',
    'JPEG or PNG',
  )
  const fileName = mimeType === 'image/png' ? 'header.png' : 'header.jpg'

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}
