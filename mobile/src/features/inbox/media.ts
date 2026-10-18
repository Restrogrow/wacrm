import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';

import { API_BASE_URL } from '@/config';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

/** Where the app stores outbound attachments (migration 023). */
export const CHAT_MEDIA_BUCKET = 'chat-media';
/** Meta's tightest caps, mirrored from the web app so oversized files are rejected before upload. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_CAPTION_MAX = 1024;

const PROXY_PREFIX = '/api/whatsapp/media/';

export interface MediaSource {
  uri: string;
  headers?: Record<string, string>;
  /** true when the file is served by our authenticated media proxy */
  proxied: boolean;
}

/**
 * Inbound media is stored as a relative proxy path (/api/whatsapp/media/<id>) that needs the
 * Bearer token; agent-sent files are public storage URLs.
 */
export function resolveMedia(url: string | null | undefined, token: string | null | undefined): MediaSource | null {
  if (!url) return null;
  if (url.startsWith(PROXY_PREFIX)) {
    return { uri: `${API_BASE_URL}${url}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined, proxied: true };
  }
  if (/^https?:\/\//i.test(url)) return { uri: url, proxied: false };
  return null;
}

export function useMediaSource(url: string | null | undefined): MediaSource | null {
  const { session } = useSession();
  const token = session?.access_token;
  return useMemo(() => resolveMedia(url, token), [url, token]);
}

/** Open a document/video: public links in the in-app browser, proxied files are downloaded then shared/opened. */
export async function openMedia(source: MediaSource, fileName = 'attachment') {
  if (!source.proxied) {
    await WebBrowser.openBrowserAsync(source.uri);
    return;
  }
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(0, 60) || 'attachment';
  const target = new FileSystem.File(FileSystem.Paths.cache, `${Date.now()}-${safe}`);
  const file = await FileSystem.File.downloadFileAsync(source.uri, target, { headers: source.headers });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
}

/** Upload a picked photo to the account's chat-media folder and return its public URL. */
export async function uploadChatImage(accountId: string, uri: string, mime: string): Promise<string> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `account-${accountId}/${Date.now()}-photo.${ext}`;
  const res = await fetch(uri);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new Error(`That photo is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. WhatsApp allows images up to 5 MB.`);
  }
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error('Could not upload the photo. Check your connection and try again.');
  return supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
