import { describe, expect, it } from 'vitest'

import { MAX_BULK, parseBulkRequest } from './bulk'
import {
  activeMentionQuery,
  applyMention,
  matchMembers,
  parseNoteInput,
  resolveMentions,
  splitMentions,
} from './mentions'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'

describe('activeMentionQuery', () => {
  it('finds the token being typed', () => {
    expect(activeMentionQuery('hi @pri', 7)).toEqual({ query: 'pri', start: 3 })
    expect(activeMentionQuery('@', 1)).toEqual({ query: '', start: 0 })
  })
  it('ignores an @ inside a word such as an email', () => {
    expect(activeMentionQuery('mail me at a@b.com', 18)).toBeNull()
  })
  it('stops at a newline', () => {
    expect(activeMentionQuery('@pri\nnext', 9)).toBeNull()
  })
})

describe('matchMembers / applyMention', () => {
  const members = [
    { id: U1, name: 'Priya Sharma' },
    { id: U2, name: 'Rahul Verma' },
  ]
  it('matches by prefix of the name or of any word', () => {
    expect(matchMembers(members, 'pri').map((m) => m.id)).toEqual([U1])
    expect(matchMembers(members, 'ver').map((m) => m.id)).toEqual([U2])
    expect(matchMembers(members, '').length).toBe(2)
  })
  it('replaces the token with the full name', () => {
    const r = applyMention('hi @pri', 3, 7, 'Priya Sharma')
    expect(r.text).toBe('hi @Priya Sharma ')
    expect(r.caret).toBe(r.text.length)
  })
})

describe('resolveMentions', () => {
  const picked = [
    { id: U1, name: 'Priya Sharma' },
    { id: U2, name: 'Rahul Verma' },
  ]
  it('drops people whose @name was deleted afterwards', () => {
    expect(resolveMentions('thanks @Priya Sharma', picked)).toEqual([U1])
  })
  it('does not duplicate', () => {
    expect(resolveMentions('@Priya Sharma @Priya Sharma', [picked[0], picked[0]])).toEqual([U1])
  })
})

describe('splitMentions', () => {
  it('marks the mentioned names', () => {
    const segs = splitMentions('ask @Priya Sharma to call', ['Priya Sharma'])
    expect(segs).toEqual([
      { text: 'ask ', mention: false },
      { text: '@Priya Sharma', mention: true },
      { text: ' to call', mention: false },
    ])
  })
  it('handles names with regex characters', () => {
    expect(splitMentions('hi @A.B (x)', ['A.B (x)'])[1]).toEqual({ text: '@A.B (x)', mention: true })
  })
  it('returns the body untouched with no mentions', () => {
    expect(splitMentions('plain', [])).toEqual([{ text: 'plain', mention: false }])
  })
})

describe('parseNoteInput', () => {
  it('accepts a valid note and de-duplicates mentions', () => {
    const r = parseNoteInput({ conversation_id: C1, body: ' hello ', mentions: [U1, U1, 'junk'] })
    expect(r).toEqual({ ok: true, value: { conversationId: C1, body: 'hello', mentions: [U1] } })
  })
  it('rejects empty, over-long and bad ids', () => {
    expect(parseNoteInput({ conversation_id: C1, body: '   ' }).ok).toBe(false)
    expect(parseNoteInput({ conversation_id: C1, body: 'x'.repeat(2001) }).ok).toBe(false)
    expect(parseNoteInput({ conversation_id: 'nope', body: 'hi' }).ok).toBe(false)
    expect(parseNoteInput(null).ok).toBe(false)
  })
})

describe('parseBulkRequest', () => {
  it('parses each action', () => {
    expect(parseBulkRequest({ action: 'mark_read', ids: [C1] })).toEqual({ ok: true, value: { action: 'mark_read', ids: [C1] } })
    expect(parseBulkRequest({ action: 'status', ids: [C1], value: 'closed' }).ok).toBe(true)
    expect(parseBulkRequest({ action: 'assign', ids: [C1], value: U1 }).ok).toBe(true)
    expect(parseBulkRequest({ action: 'tag', ids: [C1], value: U2 }).ok).toBe(true)
  })
  it('treats a null assignee as unassign', () => {
    const r = parseBulkRequest({ action: 'assign', ids: [C1], value: null })
    expect(r).toEqual({ ok: true, value: { action: 'assign', ids: [C1], userId: null } })
  })
  it('de-duplicates ids and caps the batch size', () => {
    const r = parseBulkRequest({ action: 'mark_read', ids: [C1, C1] })
    expect(r.ok && r.value.ids).toEqual([C1])
    const many = Array.from({ length: MAX_BULK + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(parseBulkRequest({ action: 'mark_read', ids: many }).ok).toBe(false)
  })
  it('rejects bad input', () => {
    expect(parseBulkRequest({ action: 'status', ids: [C1], value: 'deleted' }).ok).toBe(false)
    expect(parseBulkRequest({ action: 'tag', ids: [C1], value: 'x' }).ok).toBe(false)
    expect(parseBulkRequest({ action: 'nuke', ids: [C1] }).ok).toBe(false)
    expect(parseBulkRequest({ action: 'mark_read', ids: [] }).ok).toBe(false)
    expect(parseBulkRequest({ action: 'mark_read', ids: ['not-a-uuid'] }).ok).toBe(false)
  })
})
