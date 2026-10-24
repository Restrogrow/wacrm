// ============================================================
// Inbound shared contacts (vCards) → readable inbox text.
//
// When a customer shares one or more contacts, Meta sends
// `type: 'contacts'` with a `contacts[]` array (name, phones, emails,
// org, urls). We store a plain-text summary in content_text so the
// inbox, search, mobile app and notifications all show it without a
// new content_type.
// ============================================================

export interface SharedContact {
  name?: { formatted_name?: string; first_name?: string; last_name?: string }
  phones?: Array<{ phone?: string; wa_id?: string; type?: string }>
  emails?: Array<{ email?: string; type?: string }>
  org?: { company?: string; title?: string }
  urls?: Array<{ url?: string }>
}

const MAX_CONTACTS = 10

function contactName(c: SharedContact): string {
  const n = c.name
  const full =
    n?.formatted_name?.trim() ||
    [n?.first_name, n?.last_name].filter(Boolean).join(' ').trim()
  return full || 'Unnamed contact'
}

export function formatSharedContacts(contacts: SharedContact[] | undefined): string {
  const list = Array.isArray(contacts) ? contacts.slice(0, MAX_CONTACTS) : []
  if (list.length === 0) return '📇 Shared a contact'

  const blocks = list.map((c) => {
    const lines = [contactName(c)]
    const org = [c.org?.title, c.org?.company].filter(Boolean).join(', ')
    if (org) lines.push(org)
    for (const p of c.phones ?? []) {
      const phone = p.phone?.trim() || (p.wa_id ? `+${p.wa_id}` : '')
      if (phone) lines.push(`📞 ${phone}${p.type ? ` (${p.type.toLowerCase()})` : ''}`)
    }
    for (const e of c.emails ?? []) {
      if (e.email?.trim()) lines.push(`✉️ ${e.email.trim()}`)
    }
    for (const u of c.urls ?? []) {
      if (u.url?.trim()) lines.push(`🔗 ${u.url.trim()}`)
    }
    return lines.join('\n')
  })

  const heading = list.length === 1 ? '📇 Shared contact' : `📇 Shared ${list.length} contacts`
  const more =
    Array.isArray(contacts) && contacts.length > MAX_CONTACTS
      ? `\n\n…and ${contacts.length - MAX_CONTACTS} more`
      : ''
  return `${heading}\n${blocks.join('\n\n')}${more}`
}
