// ============================================================
// Inbound WhatsApp media → private Supabase Storage. Server-only.
//
// Meta's media IDs expire after 7 days (since Oct 2025), so a photo,
// voice note or document a customer sent last week can no longer be
// fetched from Meta. We copy each file into the PRIVATE `inbound-media`
// bucket (migration 041) when the webhook receives it, at
//
//   inbound-media/account-<account_id>/<meta media id>
//
// Messages keep their media_url `/api/whatsapp/media/<id>`; that
// authenticated route serves the stored copy and only falls back to
// Meta (saving it on the way) for media received before this existed.
// Customer files never go in the public `chat-media` bucket.
// ============================================================

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { downloadMedia, getMediaUrl } from '@/lib/whatsapp/meta-api';

export const INBOUND_MEDIA_BUCKET = 'inbound-media';

/** Matches the bucket's file_size_limit (migration 041). */
const MAX_STORED_BYTES = 50 * 1024 * 1024;

/** Meta media IDs are numeric; allow a safe superset, nothing path-like. */
export function isValidMediaId(mediaId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(mediaId);
}

export function inboundMediaPath(accountId: string, mediaId: string): string {
  return `account-${accountId}/${mediaId}`;
}

export interface MediaFile {
  buffer: Buffer;
  contentType: string;
}

/** The stored copy, or null if it isn't in storage (or storage errors). */
export async function readStoredMedia(
  accountId: string,
  mediaId: string,
): Promise<MediaFile | null> {
  if (!isValidMediaId(mediaId)) return null;
  const { data, error } = await supabaseAdmin()
    .storage.from(INBOUND_MEDIA_BUCKET)
    .download(inboundMediaPath(accountId, mediaId));
  if (error || !data) return null;
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || 'application/octet-stream',
  };
}

/**
 * Download a media file from Meta and keep a copy in storage. Returns
 * the file (so callers can serve it straight away). Throws only when
 * Meta itself can't provide it; a storage failure is logged and the
 * file is still returned, so the message still shows.
 */
export async function fetchAndStoreMedia(
  accountId: string,
  mediaId: string,
  accessToken: string,
): Promise<MediaFile> {
  const info = await getMediaUrl({ mediaId, accessToken });
  const { buffer, contentType } = await downloadMedia({
    downloadUrl: info.url,
    accessToken,
  });
  const type = contentType || info.mimeType || 'application/octet-stream';

  if (isValidMediaId(mediaId) && buffer.length <= MAX_STORED_BYTES) {
    const { error } = await supabaseAdmin()
      .storage.from(INBOUND_MEDIA_BUCKET)
      .upload(inboundMediaPath(accountId, mediaId), buffer, {
        contentType: type,
        upsert: true,
      });
    if (error) {
      // Bucket missing (migration 041 not applied) or a transient error:
      // the file still serves from Meta until it expires.
      console.warn(`[inbound-media] could not store ${mediaId}:`, error.message);
    }
  } else if (buffer.length > MAX_STORED_BYTES) {
    console.warn(`[inbound-media] ${mediaId} is ${buffer.length} bytes — too large to store`);
  }

  return { buffer, contentType: type };
}
