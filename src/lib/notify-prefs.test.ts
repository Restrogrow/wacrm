import { describe, expect, it } from 'vitest'

import { shouldAlert } from './notify-prefs'

const base = {
  conversationId: 'c1',
  assignedTo: null as string | null,
  currentUserId: 'me',
  tabHidden: false,
  location: '/dashboard',
}

describe('shouldAlert', () => {
  it('alerts for an unassigned chat while on another page', () => {
    expect(shouldAlert(base)).toBe(true)
  })

  it('alerts for my own chats', () => {
    expect(shouldAlert({ ...base, assignedTo: 'me' })).toBe(true)
  })

  it("stays quiet for a teammate's chat", () => {
    expect(shouldAlert({ ...base, assignedTo: 'someone-else' })).toBe(false)
  })

  it('stays quiet when that chat is already open on screen', () => {
    expect(shouldAlert({ ...base, location: '/inbox?c=c1' })).toBe(false)
  })

  it('alerts when the chat is open but the tab is in the background', () => {
    expect(shouldAlert({ ...base, location: '/inbox?c=c1', tabHidden: true })).toBe(true)
  })

  it('alerts when a different chat is open', () => {
    expect(shouldAlert({ ...base, location: '/inbox?c=c2' })).toBe(true)
  })
})
