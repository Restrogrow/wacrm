import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/flows/admin-client', () => ({ supabaseAdmin: () => ({}) }))
vi.mock('@/lib/email/mailer', () => ({ isEmailConfigured: () => true, sendEmail: vi.fn() }))

import { dueReminder, isIndianDaytime, reminderEmail, type ReminderAccount } from './reminders'

const NOW = Date.parse('2026-10-14T06:00:00Z') // 11:30 IST
const H = 60 * 60 * 1000

function trial(endsInHours: number, key: string | null = null): ReminderAccount {
  return {
    id: 'a',
    name: 'Priya Stores',
    plan: 'trial',
    trial_ends_at: new Date(NOW + endsInHours * H).toISOString(),
    plan_expires_at: null,
    billing_reminder_key: key,
  }
}

function paid(expiresInHours: number, key: string | null = null): ReminderAccount {
  return {
    id: 'a',
    name: 'Priya Stores',
    plan: 'growth',
    trial_ends_at: null,
    plan_expires_at: new Date(NOW + expiresInHours * H).toISOString(),
    billing_reminder_key: key,
  }
}

describe('dueReminder', () => {
  it('nothing while the trial has more than 2 days left', () => {
    expect(dueReminder(trial(60), NOW)).toBeNull()
  })

  it('2 days before, on the last day, and after it ends', () => {
    expect(dueReminder(trial(40), NOW)?.stage).toBe('trial-2d')
    expect(dueReminder(trial(10), NOW)?.stage).toBe('trial-today')
    expect(dueReminder(trial(-5), NOW)?.stage).toBe('trial-ended')
  })

  it('sends each stage once', () => {
    const first = dueReminder(trial(40), NOW)!
    expect(dueReminder(trial(40, first.key), NOW)).toBeNull()
    // …but the next stage still goes out.
    expect(dueReminder(trial(10, first.key), NOW)?.stage).toBe('trial-today')
  })

  it('stops a few days after the trial ended', () => {
    expect(dueReminder(trial(-24 * 4), NOW)).toBeNull()
  })

  it('a new trial end date starts the reminders again', () => {
    const old = dueReminder(trial(40), NOW)!
    expect(dueReminder({ ...trial(40 + 24 * 30), billing_reminder_key: old.key }, NOW + 30 * 24 * H)?.stage).toBe('trial-2d')
  })

  it('paid plans: 3 days before the paid-until date, and after it', () => {
    expect(dueReminder(paid(24 * 5), NOW)).toBeNull()
    expect(dueReminder(paid(48), NOW)?.stage).toBe('paid-3d')
    expect(dueReminder(paid(-2), NOW)?.stage).toBe('paid-ended')
  })

  it('paid plans with no end date never get reminders', () => {
    expect(dueReminder({ ...paid(0), plan_expires_at: null }, NOW)).toBeNull()
  })
})

describe('isIndianDaytime', () => {
  it('is true 9am–8pm IST only', () => {
    expect(isIndianDaytime(Date.parse('2026-10-14T03:30:00Z'))).toBe(true) // 9:00 IST
    expect(isIndianDaytime(Date.parse('2026-10-14T14:29:00Z'))).toBe(true) // 19:59 IST
    expect(isIndianDaytime(Date.parse('2026-10-14T14:30:00Z'))).toBe(false) // 20:00 IST
    expect(isIndianDaytime(Date.parse('2026-10-13T21:00:00Z'))).toBe(false) // 2:30 IST
  })
})

describe('reminderEmail', () => {
  it('explains read-only, prices and how to pay', () => {
    const { subject, text } = reminderEmail(trial(40), 'trial-2d')
    expect(subject).toMatch(/2 days/)
    expect(text).toContain('Priya Stores')
    expect(text).toContain('read-only')
    expect(text).toContain('₹1,499/month')
    expect(text).toContain('Pro: ₹5,999/month')
    expect(text).toContain('Enterprise: custom pricing')
    expect(text).toContain('/settings?tab=billing')
  })

  it('reassures that nothing is deleted after the trial ends', () => {
    expect(reminderEmail(trial(-5), 'trial-ended').text).toContain('Nothing is deleted')
  })

  it('names the paid plan in renewal emails', () => {
    expect(reminderEmail(paid(48), 'paid-3d').subject).toContain('Growth plan')
  })
})
