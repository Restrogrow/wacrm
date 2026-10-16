import { afterEach, describe, expect, it, vi } from 'vitest'

import { InboxAiError } from './inbox-ai'
import { audioMime, mediaIdFromUrl, MAX_VOICE_NOTE_BYTES, parseVoiceNote, transcribeVoiceNote } from './voice-note'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const reply = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 })

describe('mediaIdFromUrl', () => {
  it('reads the Meta media id from our proxy URL only', () => {
    expect(mediaIdFromUrl('/api/whatsapp/media/1234567890')).toBe('1234567890')
    expect(mediaIdFromUrl('https://evil.example/api/whatsapp/media/123')).toBeNull()
    expect(mediaIdFromUrl('/api/whatsapp/media/abc')).toBeNull()
    expect(mediaIdFromUrl(null)).toBeNull()
  })
})

describe('audioMime', () => {
  it('keeps known audio types and defaults to ogg', () => {
    expect(audioMime('audio/ogg; codecs=opus')).toBe('audio/ogg')
    expect(audioMime('audio/mpeg')).toBe('audio/mpeg')
    expect(audioMime('application/octet-stream')).toBe('audio/ogg')
    expect(audioMime(undefined)).toBe('audio/ogg')
  })
})

describe('parseVoiceNote', () => {
  it('uses the transcript when there is no translation', () => {
    const v = parseVoiceNote({ transcript: 'Is it in stock?', language: 'English', english: '', summary: 'Asks about stock', suggested_reply: 'Yes!' })
    expect(v.english).toBe('Is it in stock?')
  })

  it('treats a silent note as an error', () => {
    expect(() => parseVoiceNote({ transcript: '' })).toThrow(InboxAiError)
    expect(() => parseVoiceNote(null)).toThrow(InboxAiError)
  })
})

describe('transcribeVoiceNote', () => {
  it('sends the audio inline and returns the result', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    const fetchMock = vi.fn(async () =>
      reply({
        transcript: 'क्या नीली कुर्ती मिलेगी?',
        language: 'Hindi',
        english: 'Will the blue kurta be available?',
        summary: 'Asks about the blue kurta',
        suggested_reply: 'जी हाँ, नीली कुर्ती उपलब्ध है।',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const v = await transcribeVoiceNote(new Uint8Array([9, 8, 7]), 'audio/ogg', { customerName: 'Riya' })
    expect(v.language).toBe('Hindi')
    expect(v.english).toContain('blue kurta')
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    const parts = body.contents[body.contents.length - 1].parts
    expect(parts[0].inlineData.mimeType).toBe('audio/ogg')
    expect(parts[1].text).toContain('Riya')
  })

  it('does not call the AI for empty or oversized audio', async () => {
    vi.stubEnv('GEMINI_KEY', 'test-key')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(transcribeVoiceNote(new Uint8Array(0), 'audio/ogg', { customerName: '' })).rejects.toThrow(InboxAiError)
    await expect(transcribeVoiceNote(new Uint8Array(MAX_VOICE_NOTE_BYTES + 1), 'audio/ogg', { customerName: '' })).rejects.toThrow(
      InboxAiError,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
