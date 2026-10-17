// Click-to-WhatsApp ad attribution — pure helpers (no I/O), shared by the
// webhook, the inbox/contact badges and the dashboard "Lead sources" card.
//
// Meta puts a `referral` object on the first inbound message when a chat
// starts from a Click-to-WhatsApp ad or a post button:
//   { source_url, source_id, source_type: 'ad'|'post', body, headline,
//     media_type, image_url, video_url, thumbnail_url, ctwa_clid }

export type AdSourceType = 'ad' | 'post' | 'other';

export interface AdReferral {
  type: AdSourceType;
  id: string | null;
  url: string | null;
  headline: string | null;
  body: string | null;
  ctwaClid: string | null;
}

/** Name of the tag added to contacts that arrive from an ad. */
export const AD_LEAD_TAG = 'Ad lead';
export const AD_LEAD_TAG_COLOR = '#f59e0b';

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

/** http(s) only; anything else (javascript:, data:, garbage) is dropped. */
function cleanUrl(v: unknown): string | null {
  const s = clean(v, 1000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Parse the untrusted `referral` object from a webhook message.
 * Returns null when it is missing or carries no usable identifier.
 */
export function parseReferral(raw: unknown): AdReferral | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const rawType = typeof r.source_type === 'string' ? r.source_type.toLowerCase() : '';
  const type: AdSourceType = rawType === 'ad' ? 'ad' : rawType === 'post' ? 'post' : 'other';

  const referral: AdReferral = {
    type,
    id: clean(r.source_id, 100),
    url: cleanUrl(r.source_url),
    headline: clean(r.headline, 300),
    body: clean(r.body, 1000),
    ctwaClid: clean(r.ctwa_clid, 500),
  };

  // Nothing identifying the source at all: not worth recording.
  if (!referral.id && !referral.url && !referral.ctwaClid && !referral.headline) return null;
  return referral;
}

/** Column values for `contacts` (migration 062). */
export function referralToColumns(ref: AdReferral, now: Date = new Date()) {
  return {
    ad_source_type: ref.type,
    ad_source_id: ref.id,
    ad_source_url: ref.url,
    ad_headline: ref.headline,
    ad_body: ref.body,
    ad_ctwa_clid: ref.ctwaClid,
    ad_first_seen_at: now.toISOString(),
  };
}

export interface ContactAdFields {
  ad_source_type?: string | null;
  ad_source_id?: string | null;
  ad_source_url?: string | null;
  ad_headline?: string | null;
  ad_first_seen_at?: string | null;
}

/** Short human label for a contact's ad source, or null if not from an ad. */
export function adSourceLabel(c: ContactAdFields): string | null {
  if (!c.ad_first_seen_at && !c.ad_source_type) return null;
  const kind = c.ad_source_type === 'post' ? 'Post' : 'Ad';
  const name = c.ad_headline || (c.ad_source_id ? `#${c.ad_source_id}` : hostOf(c.ad_source_url));
  return name ? `${kind}: ${name}` : kind;
}

function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export interface LeadSourceRow {
  /** Stable grouping key. */
  key: string;
  label: string;
  type: AdSourceType;
  count: number;
}

/** Group contacts by ad/post (id, else headline, else url host), biggest first. */
export function aggregateLeadSources(rows: ContactAdFields[]): LeadSourceRow[] {
  const map = new Map<string, LeadSourceRow>();
  for (const c of rows) {
    if (!c.ad_first_seen_at) continue;
    const type: AdSourceType =
      c.ad_source_type === 'post' ? 'post' : c.ad_source_type === 'ad' ? 'ad' : 'other';
    const key = c.ad_source_id || c.ad_headline || hostOf(c.ad_source_url) || `unknown-${type}`;
    const label = c.ad_headline || (c.ad_source_id ? `#${c.ad_source_id}` : hostOf(c.ad_source_url)) || 'Unknown source';
    const existing = map.get(`${type}:${key}`);
    if (existing) existing.count += 1;
    else map.set(`${type}:${key}`, { key, label, type, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
