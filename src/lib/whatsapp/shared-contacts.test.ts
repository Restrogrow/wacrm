import { describe, expect, it } from 'vitest'

import { formatSharedContacts } from './shared-contacts'

describe('formatSharedContacts', () => {
  it('formats one contact with phone, email and company', () => {
    const text = formatSharedContacts([
      {
        name: { formatted_name: 'Ravi Kumar' },
        phones: [{ phone: '+91 98765 43210', wa_id: '919876543210', type: 'CELL' }],
        emails: [{ email: 'ravi@example.com' }],
        org: { company: 'Kumar Traders' },
      },
    ])
    expect(text).toBe(
      '📇 Shared contact\nRavi Kumar\nKumar Traders\n📞 +91 98765 43210 (cell)\n✉️ ravi@example.com'
    )
  })

  it('falls back to wa_id and first/last name', () => {
    const text = formatSharedContacts([
      { name: { first_name: 'Asha', last_name: 'Rao' }, phones: [{ wa_id: '919000000000' }] },
    ])
    expect(text).toContain('Asha Rao')
    expect(text).toContain('📞 +919000000000')
  })

  it('handles several and empty lists', () => {
    expect(formatSharedContacts([{ name: { formatted_name: 'A' } }, {}])).toMatch(
      /^📇 Shared 2 contacts\nA\n\nUnnamed contact$/
    )
    expect(formatSharedContacts(undefined)).toBe('📇 Shared a contact')
  })
})
