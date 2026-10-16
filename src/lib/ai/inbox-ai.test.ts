import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildTranscript, InboxAiError, messageAsText, summarizeConversation, translateText } from './inbox-ai'
import { isTranslateLanguage } from './languages'

function geminiReply(obj: unknown): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('messageAsText', () => {
  it('keeps text and labels media', () => {
    expect(messageAsText({ content_type: 'text', content_text: 'Hello' })).toBe('Hello')
    expect(messageAsText({ content_type: 'image', content_text: 'blue kurta' })).toBe('[image] blue kurta')
    expect(messageAsText({ content_type: 'audio' })).toBe('[audio]')
    expect(messageAsText({ content_type: 'template', template_name: 'order_shipped' })).toBe('[template: order_shipped]')
  })
})

describe('buildTranscript', () => {
  it('labels speakers and keeps the latest part of a long chat', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => ({
      from: (i % 2 ? 'agent' : 'customer') as 'agent' | 'customer',
      text: `message number ${i}`,
      at: '2026-10-16T10:00:00Z',
    }))
    const t = buildTranscript(lines)
    expect(t.length).toBeLessThanOrEqual(16000)
    expect(t).toContain('message number 1999')
    expect(t).not.toContain('message number 0\n')
    expect(t).toMatch(/\] (Customer|Agent): /)
  })
})

describe('languages', () => {
  it('accepts known codes only', () => {
    expect(isTranslateLanguage('hi')).toBe(true)
    expect(isTranslateLanguage('hinglish')).toBe(true)
    expect(isTranslateLanguage('xx')).toBe(false)
    expect(isTranslateLanguage(5)).toBe(false)
  })
})

describe('translateText', () => {
  it('needs an AI key', async () => {
    vi.stubEnv('GEMINI_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(translateText('namaste', 'en')).rejects.toBeInstanceOf(InboxAiError)
  })

  it('returns the translation and the detected language', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    const fetchMock = vi.fn(async () => geminiReply({ translation: 'Is the blue kurta available?', detected_language: 'Hindi' }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await translateText('क्या नीली कुर्ती उपलब्ध है?', 'en')
    expect(r).toEqual({ translation: 'Is the blue kurta available?', detected_language: 'Hindi' })
    // The customer text is sent as quoted data, not as instructions.
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(JSON.stringify(sent.contents)).toContain('<message>')
  })
})

describe('summarizeConversation', () => {
  it('parses the summary and falls back to a neutral mood', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        geminiReply({
          summary: 'Riya asked about a kurta and paid by UPI.',
          customer_wants: 'Delivery by Friday',
          key_points: ['Order #1042', '₹2,058 paid'],
          next_step: 'Share tracking link',
          customer_language: 'Hindi',
          mood: 'ecstatic',
        }),
      ),
    )
    const s = await summarizeConversation([{ from: 'customer', text: 'Hi', at: '2026-10-16T10:00:00Z' }], 'Riya')
    expect(s.summary).toContain('Riya')
    expect(s.key_points).toEqual(['Order #1042', '₹2,058 paid'])
    expect(s.mood).toBe('neutral')
  })

  it('refuses an empty chat', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    await expect(summarizeConversation([], 'Riya')).rejects.toBeInstanceOf(InboxAiError)
  })
})
