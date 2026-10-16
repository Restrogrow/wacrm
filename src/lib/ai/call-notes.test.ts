import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CallNotesError,
  formatCallNote,
  MAX_CALL_AUDIO_BYTES,
  parseCallNotes,
  summarizeCallAudio,
  type CallNotes,
} from './call-notes'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const sample: CallNotes = {
  summary: 'Riya asked for 2 blue kurtas and paid ₹2,058 by UPI.',
  customer_wants: 'Delivery before Friday',
  action_items: ['Ship order #1042 today', 'Send tracking link'],
  follow_up: 'Thursday morning on WhatsApp',
  customer_language: 'Hindi',
  mood: 'happy',
}

describe('parseCallNotes', () => {
  it('cleans the AI reply and defaults an unknown mood to neutral', () => {
    const n = parseCallNotes({ ...sample, mood: 'ecstatic', action_items: ['  a  ', 5, ''] })
    expect(n.mood).toBe('neutral')
    expect(n.action_items).toEqual(['a'])
  })

  it('needs a summary', () => {
    expect(() => parseCallNotes({ summary: '' })).toThrow(CallNotesError)
    expect(() => parseCallNotes(null)).toThrow(CallNotesError)
  })
})

describe('formatCallNote', () => {
  it('writes a readable note with to-dos and follow-up', () => {
    const text = formatCallNote(sample, { direction: 'inbound', durationSeconds: 245 })
    expect(text.split('\n')[0]).toBe('📞 AI call notes · incoming call · 4 min')
    expect(text).toContain('• Ship order #1042 today')
    expect(text).toContain('Follow up: Thursday morning on WhatsApp')
    expect(text).toContain('Language: Hindi · Mood: happy')
  })
})

describe('summarizeCallAudio', () => {
  it('sends the recording to Gemini as inline audio', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(sample) }] } }] }), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const notes = await summarizeCallAudio(new Uint8Array([1, 2, 3, 4]), 'audio/ogg', {
      customerName: 'Riya',
      direction: 'outbound',
      durationSeconds: 90,
    })
    expect(notes.summary).toContain('Riya')
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    const parts = body.contents[body.contents.length - 1].parts
    expect(parts[0].inlineData).toEqual({ mimeType: 'audio/ogg', data: Buffer.from([1, 2, 3, 4]).toString('base64') })
    expect(parts[1].text).toContain('outgoing call with Riya')
  })

  it('refuses empty or oversized recordings without calling the AI', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ctx = { customerName: '', direction: 'inbound' as const, durationSeconds: null }
    await expect(summarizeCallAudio(new Uint8Array(0), 'audio/ogg', ctx)).rejects.toThrow(CallNotesError)
    await expect(summarizeCallAudio(new Uint8Array(MAX_CALL_AUDIO_BYTES + 1), 'audio/ogg', ctx)).rejects.toThrow(
      CallNotesError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
