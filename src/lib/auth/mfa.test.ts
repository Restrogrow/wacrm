import { describe, expect, it } from 'vitest'

import { hasVerifiedFactor, mfaDecision, needsMfaChallenge } from './mfa'

const ENFORCED = ['/dashboard', '/inbox', '/settings', '/admin', '/join', '/connect']

describe('needsMfaChallenge', () => {
  it('is false for users with no factor, whatever the level (never locks anyone out)', () => {
    expect(needsMfaChallenge({ factors: [], currentLevel: 'aal1' })).toBe(false)
    expect(needsMfaChallenge({ factors: null, currentLevel: 'aal1' })).toBe(false)
    expect(needsMfaChallenge({ factors: undefined, currentLevel: undefined })).toBe(false)
  })

  it('ignores factors that were started but never verified', () => {
    expect(needsMfaChallenge({ factors: [{ status: 'unverified', factor_type: 'totp' }], currentLevel: 'aal1' })).toBe(false)
  })

  it('is true for a verified factor on an aal1 session', () => {
    expect(needsMfaChallenge({ factors: [{ status: 'verified' }], currentLevel: 'aal1' })).toBe(true)
    expect(needsMfaChallenge({ factors: [{ status: 'verified' }], currentLevel: null })).toBe(true)
  })

  it('is false once the session reached aal2', () => {
    expect(needsMfaChallenge({ factors: [{ status: 'verified' }], currentLevel: 'aal2' })).toBe(false)
  })

  it('hasVerifiedFactor handles empty input', () => {
    expect(hasVerifiedFactor(undefined)).toBe(false)
    expect(hasVerifiedFactor([{ status: 'verified' }])).toBe(true)
  })
})

describe('mfaDecision', () => {
  const d = (pathname: string, needsChallenge = true) => mfaDecision({ pathname, needsChallenge, enforcedPaths: ENFORCED })

  it('allows everything when no challenge is pending', () => {
    expect(d('/dashboard', false)).toBe('allow')
    expect(d('/api/account/members', false)).toBe('allow')
  })

  it('redirects app pages to the challenge when one is pending', () => {
    expect(d('/dashboard')).toBe('redirect')
    expect(d('/settings')).toBe('redirect')
    expect(d('/admin/blog')).toBe('redirect')
    expect(d('/join/abc')).toBe('redirect')
  })

  it('denies app APIs so a password-only session cannot use them', () => {
    expect(d('/api/account/members')).toBe('deny')
    expect(d('/api/whatsapp/send')).toBe('deny')
  })

  it('keeps the challenge page, auth callbacks and login pages reachable', () => {
    expect(d('/mfa')).toBe('allow')
    expect(d('/auth/callback')).toBe('allow')
    expect(d('/login')).toBe('allow')
    expect(d('/forgot-password')).toBe('allow')
  })

  it('does not touch public marketing pages', () => {
    expect(d('/')).toBe('allow')
    expect(d('/pricing')).toBe('allow')
    expect(d('/blog/some-post')).toBe('allow')
  })
})
