import { describe, expect, it } from 'vitest'

import { AUTOMATED_JOBS, EMAIL_CATALOG, getCatalogEntry } from './catalog'
import { autoBrandedEmail, teamInviteEmail } from './content'

describe('email catalogue', () => {
  it('has unique ids', () => {
    const ids = EMAIL_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(EMAIL_CATALOG.map((e) => [e.id, e] as const))('%s renders a complete, branded email', (_id, entry) => {
    const mail = entry.render()
    expect(mail.subject.trim().length).toBeGreaterThan(3)
    expect(mail.text.trim().length).toBeGreaterThan(20)
    expect(mail.html).toContain('<!doctype html>')
    expect(mail.html).toContain('Repeat')
    // Anything the app sends itself must have no unfilled template variables.
    if (entry.sender === 'app') {
      expect(mail.html).not.toMatch(/\{\{/)
      expect(mail.text).not.toMatch(/\{\{/)
    }
  })

  it('Supabase previews have their sample code filled in', () => {
    const mail = getCatalogEntry('auth-confirm-signup')!.render()
    expect(mail.html).toContain('482915')
    expect(mail.html).not.toContain('{{ .Token }}')
  })

  it('every cron job lists at least one task', () => {
    for (const job of AUTOMATED_JOBS) expect(job.tasks.length).toBeGreaterThan(0)
  })
})

describe('autoBrandedEmail', () => {
  it('turns bullet lists into rows and keeps the wording', () => {
    const mail = autoBrandedEmail({
      subject: 'Plans',
      text: 'Hi,\n\nPick a plan.\n\nPlans:\n• Starter: ₹999/month\n• Pro: ₹2,999/month\n\nReply to this email.',
      reason: 'because',
    })
    expect(mail.html).toContain('Starter')
    expect(mail.html).toContain('₹999/month')
    expect(mail.html).toContain('Pick a plan.')
    expect(mail.html).toContain('Reply to this email.')
  })

  it('escapes HTML in user-supplied text', () => {
    const mail = autoBrandedEmail({ subject: 's', text: 'Hi,\n\n<script>alert(1)</script>', reason: 'r' })
    expect(mail.html).not.toContain('<script>alert(1)</script>')
  })
})

describe('teamInviteEmail', () => {
  it('names the inviter, team and link', () => {
    const mail = teamInviteEmail({
      inviterName: 'Priya',
      accountName: 'Demo Store',
      role: 'agent',
      url: 'https://repeatgrow.com/join/abc',
      expiresInDays: 7,
    })
    expect(mail.subject).toContain('Priya')
    expect(mail.html).toContain('https://repeatgrow.com/join/abc')
    expect(mail.text).toContain('Demo Store')
  })
})
