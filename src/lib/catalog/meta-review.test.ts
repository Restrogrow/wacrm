import { describe, expect, it } from 'vitest'

import { reviewLabel } from './meta-review'

describe('reviewLabel', () => {
  it('maps Meta review statuses to what the merchant sees', () => {
    expect(reviewLabel('approved')).toEqual({ label: 'Approved by Meta', tone: 'ok' })
    expect(reviewLabel('OUTDATED').tone).toBe('ok')
    expect(reviewLabel('rejected')).toEqual({ label: 'Rejected by Meta', tone: 'bad' })
  })

  it('treats empty, pending or unknown as waiting for review', () => {
    for (const s of ['', 'pending', null, undefined, 'something-new']) {
      expect(reviewLabel(s)).toEqual({ label: 'Waiting for Meta review', tone: 'wait' })
    }
  })
})
