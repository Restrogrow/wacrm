import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LIVE_MODEL,
  VoiceAgentError,
  buildLiveSetup,
  buildVoiceAgentPrompt,
  createLiveToken,
  liveModel,
} from './voice-agent'
import { END_CALL_TOOL, HANDOFF_TOOL } from '@/lib/calls/live-agent'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const base = {
  direction: 'outbound' as const,
  businessName: 'Taste of Banaras',
  botName: 'Riya',
  knowledgeBase: 'Thali ₹299. Open 11am-11pm.',
  instructions: 'Never give discounts.',
  voiceInstructions: 'Ask which tiffin plan they want.',
  customerName: 'Amit',
  now: new Date('2026-10-19T10:00:00Z'),
}

describe('buildVoiceAgentPrompt', () => {
  it('includes the business, AI disclosure, goal, rules, knowledge and tools', () => {
    const p = buildVoiceAgentPrompt(base)
    expect(p).toContain('You are Riya, an AI voice assistant')
    expect(p).toContain('Taste of Banaras')
    expect(p).toContain('by name (Amit)')
    expect(p).toContain('say you are an AI assistant')
    expect(p).toContain('Ask which tiffin plan they want.')
    expect(p).toContain('Never give discounts.')
    expect(p).toContain('Thali ₹299')
    expect(p).toContain(END_CALL_TOOL)
    expect(p).toContain(HANDOFF_TOOL)
    expect(p).toContain('3:30 pm') // 10:00 UTC in IST
  })

  it('falls back to a default goal and warns when there is no knowledge', () => {
    const p = buildVoiceAgentPrompt({
      ...base,
      voiceInstructions: '  ',
      knowledgeBase: '',
      instructions: '',
      customerName: null,
    })
    expect(p).toContain('Follow up on their enquiry')
    expect(p).toContain('Do not state any business facts')
    expect(p).not.toContain('# Business rules and tone')
    expect(p).not.toContain('by name')
  })
})

describe('buildVoiceAgentPrompt (incoming calls)', () => {
  it('answers as the business and uses the inbound script', () => {
    const p = buildVoiceAgentPrompt({ ...base, direction: 'inbound', voiceInstructions: 'Take table bookings.' })
    expect(p).toContain('answering a WhatsApp call to Taste of Banaras')
    expect(p).toContain('thank them for calling Taste of Banaras')
    expect(p).toContain('Take table bookings.')
    expect(p).not.toContain('You placed this call')
  })

  it('has its own default goal', () => {
    const p = buildVoiceAgentPrompt({ ...base, direction: 'inbound', voiceInstructions: '' })
    expect(p).toContain('Help the caller')
  })
})

describe('buildLiveSetup', () => {
  it('builds the Live setup with audio output, tools and transcription', () => {
    const { setup } = buildLiveSetup('gemini-3.8-live', 'PROMPT', 'Kore')
    expect(setup.model).toBe('models/gemini-3.8-live')
    expect(setup.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(setup.generationConfig.speechConfig?.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(setup.systemInstruction.parts[0].text).toBe('PROMPT')
    const names = setup.tools[0].functionDeclarations.map((f) => f.name)
    expect(names).toEqual([END_CALL_TOOL, HANDOFF_TOOL])
    expect(setup.inputAudioTranscription).toEqual({})
    expect(setup.outputAudioTranscription).toEqual({})
  })

  it('leaves the voice to Google when none is picked', () => {
    const { setup } = buildLiveSetup('m', 'P', '')
    expect(setup.generationConfig).not.toHaveProperty('speechConfig')
  })
})

describe('liveModel', () => {
  it('uses GEMINI_LIVE_MODEL when set', () => {
    expect(liveModel()).toBe(process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL)
    vi.stubEnv('GEMINI_LIVE_MODEL', 'gemini-x-live')
    expect(liveModel()).toBe('gemini-x-live')
  })
})

describe('createLiveToken', () => {
  it('fails without a key', async () => {
    vi.stubEnv('GEMINI_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    await expect(createLiveToken()).rejects.toBeInstanceOf(VoiceAgentError)
  })

  it('requests a single-use, short-lived token and returns its name', async () => {
    vi.stubEnv('GEMINI_KEY', 'k')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'auth_tokens/abc' })))
    vi.stubGlobal('fetch', fetchMock)
    const now = Date.parse('2026-10-19T10:00:00Z')
    await expect(createLiveToken(now)).resolves.toBe('auth_tokens/abc')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens')
    expect(init.headers['x-goog-api-key']).toBe('k')
    const body = JSON.parse(init.body)
    expect(body.uses).toBe(1)
    expect(body.newSessionExpireTime).toBe('2026-10-19T10:01:00.000Z')
    expect(body.expireTime).toBe('2026-10-19T10:30:00.000Z')
  })

  it('maps a rate limit to a friendly 429', async () => {
    vi.stubEnv('GEMINI_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    await expect(createLiveToken()).rejects.toMatchObject({ status: 429 })
  })
})
