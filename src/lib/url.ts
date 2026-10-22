// Dependency-free URL helpers, safe to import from client and server code.

/**
 * An http(s) URL with a host, written exactly as such: no spaces or
 * backslashes the URL parser would quietly fix up, so the string we store
 * and send to Meta is the one that was checked. Only these are sent to
 * Meta, stored, or rendered as links (never javascript:, data: or a bare
 * "https://").
 */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s\\]+$/i.test(value)) return false
  try {
    const u = new URL(value)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname !== ''
  } catch {
    return false
  }
}
