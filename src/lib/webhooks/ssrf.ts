// ============================================================
// SSRF guard for outbound webhook delivery.
//
// A webhook URL is attacker-influenced (any account admin with
// `webhooks:manage` can register one) and our server makes the request,
// so an unguarded fetch is a Server-Side Request Forgery primitive: a
// URL pointing at `127.0.0.1`, a cloud metadata IP (`169.254.169.254`),
// or an RFC1918 host would let a caller probe / POST to internal
// services from the app's network.
//
// `isDeliverableUrl` resolves the host and rejects any address that is
// loopback, private, link-local, ULA, or otherwise non-publicly-
// routable. Combined with `redirect: 'manual'` at the call site (so a
// public URL can't 3xx-bounce to an internal one), this blocks the
// common SSRF vectors. It is NOT a defense against DNS rebinding (a
// host that resolves public here but flips to private before connect) —
// that needs pinning the resolved IP into the socket, which fetch
// doesn't expose; documented as a residual risk.
// ============================================================

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateOrReservedIpv4(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/**
 * Expand an IPv6 address to 8 numeric groups. Handles `::` and a trailing
 * dotted IPv4 part. Returns null if it is not valid IPv6.
 */
function expandIpv6(ip: string): number[] | null {
  let s = ip;
  const tail = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const [p, q, r, t] = tail.slice(1).map(Number);
    if ([p, q, r, t].some((n) => n > 255)) return null;
    s = s.slice(0, -tail[0].length) + `${((p << 8) | q).toString(16)}:${((r << 8) | t).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':') : []);
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/** True for loopback / private / link-local / reserved IPv4 or IPv6. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return isPrivateOrReservedIpv4(Number(v4[1]), Number(v4[2]), Number(v4[3]));

  const g = expandIpv6(ip.toLowerCase().replace(/^\[|\]$/g, ''));
  if (!g) return true; // not a parseable address: refuse

  // An embedded IPv4 address in any of the forms an attacker can write
  // (::ffff:7f00:1, ::127.0.0.1, 64:ff9b::7f00:1) is judged as IPv4.
  const v4From = (hi: number, lo: number) => isPrivateOrReservedIpv4(hi >> 8, hi & 0xff, lo >> 8);
  const firstFiveZero = g.slice(0, 5).every((n) => n === 0);
  if (firstFiveZero && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: and ::1
    return v4From(g[6], g[7]); // IPv4-mapped / IPv4-compatible
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 (64:ff9b::/96 and /48)

  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2002) return true; // 6to4 can embed any IPv4
  return false;
}

/**
 * True if `rawUrl`'s host resolves only to publicly-routable
 * address(es). Returns false for a malformed URL, an obvious internal
 * name (`localhost`, `*.local`, `*.internal`), a literal private IP, or
 * a hostname that resolves to any private/reserved address.
 */
export async function isDeliverableUrl(rawUrl: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }

  if (isIP(host)) return !isPrivateOrReservedIp(host);

  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return false;
  }

  try {
    const results = await lookup(host, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateOrReservedIp(r.address));
  } catch {
    return false; // unresolvable → not deliverable
  }
}

export class UnsafeUrlError extends Error {
  constructor(message = 'This URL points to a private or internal address') {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * fetch() for a URL a customer typed in. Every hop (including redirects,
 * which are followed manually, at most `maxRedirects`) must be an http(s)
 * URL that resolves to a public address. Times out after `timeoutMs`.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; httpsOnly?: boolean; maxRedirects?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, httpsOnly = false, maxRedirects = 3 } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = rawUrl;
  let method = init.method;
  let body = init.body;

  for (let hop = 0; ; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new UnsafeUrlError('Invalid URL');
    }
    const allowed = httpsOnly ? ['https:'] : ['https:', 'http:'];
    if (!allowed.includes(parsed.protocol)) {
      throw new UnsafeUrlError(httpsOnly ? 'The URL must start with https://' : 'The URL must start with http:// or https://');
    }
    if (!(await isDeliverableUrl(url))) throw new UnsafeUrlError();

    const res = await fetch(url, { ...init, method, body, redirect: 'manual', signal });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new UnsafeUrlError('Too many redirects');
      url = new URL(location, url).toString();
      // 303 (and 301/302 for POST, as browsers do) turn into a GET.
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && method && method !== 'GET')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    return res;
  }
}

/** Read a response body, refusing anything larger than `maxBytes`. */
export async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new UnsafeUrlError('The file is too large');
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeUrlError('The file is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
