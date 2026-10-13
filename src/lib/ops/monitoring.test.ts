import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsert = vi.fn()
const insert = vi.fn()
const del = vi.fn()

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      upsert: (...args: unknown[]) => upsert(...args),
      insert: (...args: unknown[]) => insert(...args),
      delete: () => ({ lt: (...args: unknown[]) => del(...args) }),
    }),
  }),
}))

import { evaluateJobs, recordWebhookFailure, withHeartbeat, type HeartbeatRow } from './monitoring'

const NOW = new Date('2026-10-14T10:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

function row(job: string, fields: Partial<HeartbeatRow>): HeartbeatRow {
  return {
    job,
    last_started_at: null,
    last_finished_at: null,
    last_ok_at: null,
    last_error: null,
    last_error_at: null,
    last_duration_ms: null,
    last_result: null,
    ...fields,
  }
}

describe('evaluateJobs', () => {
  it('marks jobs without a heartbeat as never', () => {
    const jobs = evaluateJobs([], NOW)
    expect(jobs.every((j) => j.state === 'never')).toBe(true)
  })

  it('is ok when the last success is recent', () => {
    const jobs = evaluateJobs([row('automations-cron', { last_ok_at: minutesAgo(1) })], NOW)
    expect(jobs.find((j) => j.job === 'automations-cron')?.state).toBe('ok')
  })

  it('is stale when no success inside the allowed window', () => {
    const jobs = evaluateJobs([row('automations-cron', { last_ok_at: minutesAgo(11) })], NOW)
    expect(jobs.find((j) => j.job === 'automations-cron')?.state).toBe('stale')
  })

  it('uses a longer window for the flows cron', () => {
    const jobs = evaluateJobs([row('flows-cron', { last_ok_at: minutesAgo(20) })], NOW)
    expect(jobs.find((j) => j.job === 'flows-cron')?.state).toBe('ok')
  })

  it('is failing when the latest run errored, and shows the error', () => {
    const jobs = evaluateJobs(
      [row('daily-summaries', { last_ok_at: minutesAgo(5), last_error: 'SMTP down', last_error_at: minutesAgo(1) })],
      NOW,
    )
    const job = jobs.find((j) => j.job === 'daily-summaries')
    expect(job?.state).toBe('failing')
    expect(job?.lastError).toBe('SMTP down')
  })

  it('recovers once a later run succeeds', () => {
    const jobs = evaluateJobs(
      [row('daily-summaries', { last_ok_at: minutesAgo(1), last_error: 'old', last_error_at: minutesAgo(5) })],
      NOW,
    )
    const job = jobs.find((j) => j.job === 'daily-summaries')
    expect(job?.state).toBe('ok')
    expect(job?.lastError).toBeNull()
  })
})

describe('withHeartbeat', () => {
  beforeEach(() => {
    upsert.mockReset().mockResolvedValue({ error: null })
  })

  it('returns the result and records a success', async () => {
    await expect(withHeartbeat('flows-cron', async () => 3)).resolves.toBe(3)
    const saved = upsert.mock.calls[0][0]
    expect(saved.job).toBe('flows-cron')
    expect(saved.last_ok_at).toBeTruthy()
    expect(saved.last_result).toEqual({ value: 3 })
  })

  it('records the error and rethrows it', async () => {
    await expect(
      withHeartbeat('flows-cron', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const saved = upsert.mock.calls[0][0]
    expect(saved.last_error).toBe('boom')
    expect(saved.last_ok_at).toBeUndefined()
  })

  it('never fails the job when the heartbeat cannot be saved', async () => {
    upsert.mockResolvedValue({ error: { message: 'relation "system_heartbeats" does not exist' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(withHeartbeat('flows-cron', async () => 'done')).resolves.toBe('done')
    warn.mockRestore()
  })
})

describe('recordWebhookFailure', () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null })
    del.mockReset().mockResolvedValue({ error: null })
  })

  it('stores source, account and message', async () => {
    await recordWebhookFailure('shopify', new Error('bad payload'), {
      accountId: 'acc-1',
      context: { topic: 'orders/create' },
    })
    expect(insert).toHaveBeenCalledWith({
      source: 'shopify',
      account_id: 'acc-1',
      error: 'bad payload',
      context: { topic: 'orders/create' },
    })
  })

  it('never throws, even when the insert blows up', async () => {
    insert.mockRejectedValue(new Error('network'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordWebhookFailure('whatsapp', 'oops')).resolves.toBeUndefined()
    warn.mockRestore()
  })
})
