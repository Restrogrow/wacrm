import { describe, expect, it } from 'vitest'

import { describeSendFailure } from './send-errors'

describe('describeSendFailure', () => {
  it('combines the hint, Meta detail and code', () => {
    const text = describeSendFailure(131053, 'Media upload error')
    expect(text).toContain('could not fetch or process the media')
    expect(text).toContain('WhatsApp says: Media upload error')
    expect(text).toMatch(/\(error 131053\)$/)
  })

  it('falls back to Meta detail for unknown codes', () => {
    expect(describeSendFailure(999999, 'Something new')).toBe('WhatsApp says: Something new (error 999999)')
  })

  it('handles a failure with no reason', () => {
    expect(describeSendFailure(null, null)).toBe('WhatsApp did not deliver this message. No reason was given.')
  })
})
