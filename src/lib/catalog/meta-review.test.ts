import { describe, expect, it } from 'vitest'

import { reviewLabel } from './meta-review'

describe('reviewLabel', () => {
  it('maps Meta review statuses to what the merchant sees', () => {
    expect(reviewLabel('approved')).toEqual({ label: 'Approved by Meta', tone: 'ok' })
    expect(reviewLabel('OUTDATED')?.tone).toBe('ok')
    expect(reviewLabel('rejected')).toEqual({ label: 'Rejected by Meta', tone: 'bad' })
  })

  it('shows waiting only for an explicit pending status', () => {
    expect(reviewLabel('pending')).toEqual({ label: 'Waiting for Meta review', tone: 'wait' })
  })

  it('says nothing when Meta leaves the status empty or unknown', () => {
    // Meta often returns an empty review_status for products WhatsApp can already send.
    for (const s of ['', null, undefined, 'something-new']) expect(reviewLabel(s)).toBeNull()
  })
})
