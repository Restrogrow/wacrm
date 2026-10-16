import { describe, expect, it } from 'vitest'

import { pickRoundRobinAgent, type RoundRobinLoad } from './round-robin'

const now = Date.parse('2026-10-16T12:00:00Z')
const fresh = new Date(now - 10_000).toISOString()
const stale = new Date(now - 10 * 60_000).toISOString()

const members = [
  { user_id: 'a', account_role: 'owner' },
  { user_id: 'b', account_role: 'agent' },
  { user_id: 'c', account_role: 'agent' },
  { user_id: 'v', account_role: 'viewer' },
]

describe('pickRoundRobinAgent', () => {
  it('never assigns to a viewer', () => {
    const loads = new Map<string, RoundRobinLoad>([
      ['a', { open: 5 }],
      ['b', { open: 5 }],
      ['c', { open: 5 }],
    ])
    expect(pickRoundRobinAgent(members, [], loads, now)).not.toBe('v')
    expect(pickRoundRobinAgent([{ user_id: 'v', account_role: 'viewer' }], [], new Map(), now)).toBeNull()
  })

  it('prefers online members over offline ones', () => {
    const presence = [
      { user_id: 'b', status: 'online' as const, last_seen_at: fresh },
      { user_id: 'c', status: 'online' as const, last_seen_at: stale },
    ]
    const loads = new Map<string, RoundRobinLoad>([['b', { open: 9 }]])
    expect(pickRoundRobinAgent(members, presence, loads, now)).toBe('b')
  })

  it('falls back to everyone when nobody is online', () => {
    const loads = new Map<string, RoundRobinLoad>([
      ['a', { open: 3 }],
      ['b', { open: 1 }],
      ['c', { open: 2 }],
    ])
    expect(pickRoundRobinAgent(members, [], loads, now)).toBe('b')
  })

  it('breaks ties by who was assigned longest ago, so the turn rotates', () => {
    const loads = new Map<string, RoundRobinLoad>([
      ['a', { open: 0, lastAssignedAt: '2026-10-16T11:59:00Z' }],
      ['b', { open: 0, lastAssignedAt: '2026-10-16T11:00:00Z' }],
      ['c', { open: 0, lastAssignedAt: '2026-10-16T11:30:00Z' }],
    ])
    expect(pickRoundRobinAgent(members, [], loads, now)).toBe('b')
  })

  it('gives the first chat to someone who has never had one', () => {
    const loads = new Map<string, RoundRobinLoad>([
      ['a', { open: 0, lastAssignedAt: '2026-10-16T11:00:00Z' }],
      ['b', { open: 0, lastAssignedAt: '2026-10-16T11:10:00Z' }],
    ])
    expect(pickRoundRobinAgent(members, [], loads, now)).toBe('c')
  })
})
