// The public demo login (`demo` / `demo` on /login, see /api/demo-login)
// hands anyone on the internet an admin session in the demo workspace,
// which lives on the production database. Visitors may look around, edit
// sample data and try the AI features (capped by the account's daily AI
// quota), but not change who owns or can reach the workspace, connect or
// reconfigure WhatsApp and integrations, or send real messages from the
// business number. The proxy refuses these writes for the demo user.
//
// Pure (no server imports) so it can be unit tested and used by the proxy.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** API path prefixes the demo user may not write to. */
const BLOCKED_PREFIXES = [
  // ownership, members, API keys, deletion, billing
  '/api/account/api-keys',
  '/api/account/delete',
  '/api/account/transfer-ownership',
  '/api/account/members',
  '/api/account/invitations',
  '/api/account/billing',
  '/api/account/daily-summary',
  '/api/v1/connect',
  // WhatsApp number setup and anything that messages or calls a real phone
  '/api/whatsapp/config',
  '/api/whatsapp/embedded-signup',
  '/api/whatsapp/calling-settings',
  '/api/whatsapp/smb-sync',
  '/api/whatsapp/send',
  '/api/whatsapp/broadcast',
  '/api/whatsapp/calls',
  '/api/whatsapp/react',
  '/api/whatsapp/commerce/share',
  '/api/whatsapp/commerce/enable-cart',
  '/api/whatsapp/templates/submit',
  '/api/scheduled-messages',
  '/api/csat/request',
  '/api/inbox/conversations/bulk',
  // integrations, payment links, outgoing webhooks, short links on our domain
  '/api/integrations',
  '/api/payments',
  '/api/short-links',
]

/** `/api/whatsapp/forms/<id>/send` and `/api/journeys/<id>/enroll` send to customers. */
const BLOCKED_PATTERNS = [
  /^\/api\/whatsapp\/forms\/[^/]+\/send\/?$/,
  /^\/api\/journeys\/[^/]+\/enroll\/?$/,
  /^\/api\/inbox\/conversations\/[^/]+\/share\/?$/,
]

export const DEMO_BLOCKED_MESSAGE =
  'This is turned off in the demo. Sign up for your own free workspace to use it.'

/** True when the demo user must not make this request. */
export function isDemoBlockedRequest(pathname: string, method: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false
  // Normalise so "/api//account/delete" or "/API/..." can't slip past.
  const path = pathname.replace(/\/{2,}/g, '/').toLowerCase()
  if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return true
  return BLOCKED_PATTERNS.some((re) => re.test(path))
}

/** True when `email` is the shared demo login (DEMO_LOGIN_EMAIL). */
export function isDemoEmail(email: string | null | undefined, demoEmail: string | undefined): boolean {
  return !!email && !!demoEmail && email.trim().toLowerCase() === demoEmail.trim().toLowerCase()
}
