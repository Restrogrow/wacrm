// ============================================================
// Branded HTML email shell (logo header, content card, footer).
//
// Table-based layout with inline styles, which is what Gmail, Outlook
// and Apple Mail render reliably. Images use absolute URLs on the public
// site, because email clients cannot load relative paths.
// ============================================================

const SITE = 'https://repeatgrow.com'
const LOGO_URL = `${SITE}/_next/image?url=%2Flogo-v2.png&w=96&q=75`
const BRAND = '#0da968'
const INK = '#16212c'
const MUTED = '#5f6a7a'
const LINE = '#e6e9ee'

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export interface EmailRow {
  label: string
  value: string
  /** Optional link for the value (mailto:, tel:, https:). */
  href?: string
}

export interface EmailButton {
  label: string
  href: string
  /** Primary is solid brand green, secondary is an outline. */
  variant?: 'primary' | 'secondary'
}

export interface BrandedEmailInput {
  /** Hidden preview text shown next to the subject in inboxes. */
  preheader: string
  eyebrow?: string
  title: string
  intro?: string
  rows?: EmailRow[]
  note?: { label: string; text: string }
  /** A one-time code (OTP) shown large and easy to copy. */
  code?: { label: string; value: string; hint?: string }
  buttons?: EmailButton[]
  /** Small grey line above the footer links. */
  reason: string
}

function button(b: EmailButton): string {
  const primary = (b.variant ?? 'primary') === 'primary'
  const style = primary
    ? `background:${BRAND};color:#ffffff;border:1px solid ${BRAND};`
    : `background:#ffffff;color:${INK};border:1px solid #cfd5de;`
  return `<a href="${escapeHtml(b.href)}" style="display:inline-block;${style}font-size:14px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:999px;margin:0 8px 8px 0;">${escapeHtml(b.label)}</a>`
}

export function brandedEmailHtml(input: BrandedEmailInput): string {
  const rows = (input.rows ?? [])
    .map((r) => {
      const value = r.href
        ? `<a href="${escapeHtml(r.href)}" style="color:${BRAND};text-decoration:none;font-weight:600;">${escapeHtml(r.value)}</a>`
        : escapeHtml(r.value)
      return `<tr>
        <td style="padding:11px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};width:38%;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:11px 0;border-bottom:1px solid ${LINE};font-size:15px;color:${INK};vertical-align:top;">${value}</td>
      </tr>`
    })
    .join('')

  const note = input.note
    ? `<div style="margin-top:22px;padding:14px 16px;background:#f4f7f9;border-radius:10px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">${escapeHtml(input.note.label)}</div>
        <div style="font-size:14px;line-height:1.6;color:${INK};white-space:pre-line;">${escapeHtml(input.note.text)}</div>
      </div>`
    : ''

  const code = input.code
    ? `<div style="margin-top:24px;text-align:center;padding:20px 16px;background:#f0faf5;border:1px dashed ${BRAND};border-radius:14px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:8px;">${escapeHtml(input.code.label)}</div>
        <div style="font-size:34px;font-weight:800;letter-spacing:.32em;color:${INK};font-family:'SFMono-Regular',Menlo,Consolas,monospace;padding-left:.32em;">${escapeHtml(input.code.value)}</div>
        ${input.code.hint ? `<div style="font-size:12.5px;color:${MUTED};margin-top:8px;">${escapeHtml(input.code.hint)}</div>` : ''}
      </div>`
    : ''

  const buttons = input.buttons?.length
    ? `<div style="margin-top:26px;">${input.buttons.map(button).join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f4f7;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f7;">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
      <tr><td style="padding:0 4px 18px;">
        <a href="${SITE}" style="text-decoration:none;">
          <img src="${LOGO_URL}" width="36" height="36" alt="Repeat Grow" style="vertical-align:middle;border:0;border-radius:8px;">
          <span style="vertical-align:middle;margin-left:10px;font-size:19px;font-weight:700;color:${INK};letter-spacing:-.01em;">Repeat<span style="color:${MUTED};font-weight:600;">Grow</span></span>
        </a>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px 30px;">
        ${input.eyebrow ? `<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BRAND};margin-bottom:10px;">${escapeHtml(input.eyebrow)}</div>` : ''}
        <h1 style="margin:0;font-size:22px;line-height:1.3;color:${INK};font-weight:700;">${escapeHtml(input.title)}</h1>
        ${input.intro ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(input.intro)}</p>` : ''}
        ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:1px solid ${LINE};">${rows}</table>` : ''}
        ${code}
        ${note}
        ${buttons}
      </td></tr>
      <tr><td style="padding:22px 6px 0;text-align:center;">
        <p style="margin:0 0 10px;font-size:12.5px;line-height:1.6;color:${MUTED};">${escapeHtml(input.reason)}</p>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.8;color:${MUTED};">
          <a href="${SITE}" style="color:${MUTED};text-decoration:underline;">repeatgrow.com</a> &nbsp;|&nbsp;
          <a href="mailto:support@repeatgrow.com" style="color:${MUTED};text-decoration:underline;">support@repeatgrow.com</a> &nbsp;|&nbsp;
          <a href="https://wa.me/916377568749" style="color:${MUTED};text-decoration:underline;">WhatsApp +91 63775 68749</a>
        </p>
        <p style="margin:0;font-size:12px;color:#8a94a3;">Repeat Grow &middot; WhatsApp CRM for Indian businesses &middot; Official WhatsApp Business API</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function brandedEmailText(input: BrandedEmailInput): string {
  const lines = [input.title, '']
  if (input.intro) lines.push(input.intro, '')
  for (const r of input.rows ?? []) lines.push(`${r.label}: ${r.value}`)
  if (input.code) lines.push('', `${input.code.label}: ${input.code.value}`, ...(input.code.hint ? [input.code.hint] : []))
  if (input.note) lines.push('', `${input.note.label}:`, input.note.text)
  for (const b of input.buttons ?? []) lines.push('', `${b.label}: ${b.href}`)
  lines.push('', '--', input.reason, 'Repeat Grow | repeatgrow.com | support@repeatgrow.com')
  return lines.join('\n')
}
