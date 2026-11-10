import { describe, expect, it } from 'vitest'

import { EMPTY_SLA_SUMMARY, parseSlaSummary } from './queries'

describe('parseSlaSummary', () => {
  it('reads a row as Postgres returns it', () => {
    // bigint comes back as a string over PostgREST, not a number.
    expect(
      parseSlaSummary({
        overdue_now: '3',
        breached_chats: '11',
        still_waiting: '2',
        reminded_chats: '7',
        escalated_chats: '4',
        recovery_avg_s: 5400.5,
        recovery_median_s: 3600,
        recovery_samples: '9',
      }),
    ).toEqual({
      overdueNow: 3,
      breachedChats: 11,
      stillWaiting: 2,
      remindedChats: 7,
      escalatedChats: 4,
      recoveryAvgS: 5400.5,
      recoveryMedianS: 3600,
      recoverySamples: 9,
    })
  })

  it('treats a missing row as all-zero', () => {
    expect(parseSlaSummary(undefined)).toEqual(EMPTY_SLA_SUMMARY)
  })

  it('keeps nothing-to-average apart from an average of zero', () => {
    // avg()/percentile_cont() over no rows is NULL. Reporting 0 would
    // claim every overdue chat was answered instantly.
    const s = parseSlaSummary({
      overdue_now: '1',
      breached_chats: '1',
      still_waiting: '1',
      reminded_chats: '0',
      escalated_chats: '0',
      recovery_avg_s: null,
      recovery_median_s: null,
      recovery_samples: '0',
    })
    expect(s.recoveryAvgS).toBeNull()
    expect(s.recoveryMedianS).toBeNull()
    expect(s.recoverySamples).toBe(0)
  })

  it('falls back to 0 on a value that is not a number', () => {
    const s = parseSlaSummary({ overdue_now: 'nonsense', breached_chats: undefined })
    expect(s.overdueNow).toBe(0)
    expect(s.breachedChats).toBe(0)
    expect(s.recoveryAvgS).toBeNull()
  })
})
