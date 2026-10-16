// Round-robin chat assignment for the "Assign conversation" automation
// step. Pure function, so the rules are unit-tested.
//
// Rules:
//   1. Only owners, admins and agents can receive chats (never viewers).
//   2. Prefer members who are online right now (fresh presence heartbeat).
//      If nobody is online, everyone eligible is in the pool, so chats
//      still get an owner.
//   3. Within the pool, pick whoever has the fewest open or pending chats.
//      Ties go to the member who was assigned a chat longest ago, so the
//      turn passes around the team.

import { derivePresence, type StoredPresence } from '@/lib/presence'

export interface RoundRobinMember {
  user_id: string
  account_role: string
}

export interface RoundRobinPresence {
  user_id: string
  status: StoredPresence
  last_seen_at: string
}

export interface RoundRobinLoad {
  /** Open + pending conversations currently assigned to this member. */
  open: number
  /** When this member was last given a chat (ISO), if known. */
  lastAssignedAt?: string | null
}

const ELIGIBLE_ROLES = new Set(['owner', 'admin', 'agent'])

export function pickRoundRobinAgent(
  members: RoundRobinMember[],
  presence: RoundRobinPresence[],
  loads: Map<string, RoundRobinLoad>,
  now: number,
): string | null {
  const eligible = members.filter((m) => ELIGIBLE_ROLES.has(m.account_role))
  if (eligible.length === 0) return null

  const presenceById = new Map(presence.map((p) => [p.user_id, p]))
  const online = eligible.filter((m) => {
    const p = presenceById.get(m.user_id)
    return derivePresence(p?.status, p?.last_seen_at, now) === 'online'
  })
  const pool = online.length > 0 ? online : eligible

  const lastAt = (id: string) => {
    const iso = loads.get(id)?.lastAssignedAt
    const t = iso ? Date.parse(iso) : NaN
    return Number.isNaN(t) ? -Infinity : t
  }

  const sorted = [...pool].sort((a, b) => {
    const la = loads.get(a.user_id)?.open ?? 0
    const lb = loads.get(b.user_id)?.open ?? 0
    if (la !== lb) return la - lb
    const ta = lastAt(a.user_id)
    const tb = lastAt(b.user_id)
    if (ta !== tb) return ta - tb
    return a.user_id.localeCompare(b.user_id)
  })
  return sorted[0]?.user_id ?? null
}
