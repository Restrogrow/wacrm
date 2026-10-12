// `next` (where to go after signing in) is attacker-controllable — anyone
// can craft `/login?next=https://evil.com` — so only accept a same-origin
// path: a single leading `/`, not `//` or `/\` (which browsers treat as
// protocol-relative), and no control characters.
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
