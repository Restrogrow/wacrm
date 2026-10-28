import { describe, expect, it } from 'vitest'

import { callCostUsd, estimateChatbotCost, modelPrice, TYPICAL_CHATBOT_TOKENS } from './pricing'
import { usageFromMetadata } from './gemini'

describe('pricing', () => {
  it('uses the introductory 3.8 Flash price in 2026 and the full price from 2027', () => {
    expect(modelPrice('gemini-3.8-flash', new Date('2026-10-29'))).toMatchObject({ input: 0.75, output: 3.75, known: true })
    expect(modelPrice('gemini-3.8-flash', new Date('2027-01-01T00:00:00Z'))).toMatchObject({ input: 1.5, output: 7.5 })
  })

  it('falls back to the default price for an unknown model', () => {
    expect(modelPrice('gemini-9-mystery')).toMatchObject({ known: false })
  })

  it('bills thinking as output and audio at the audio rate', () => {
    const at = new Date('2026-10-29')
    // 1M text in ($0.75) + 1M thinking ($3.75) on 3.8 Flash.
    expect(callCostUsd('gemini-3.8-flash', { input_tokens: 1_000_000, output_tokens: 0, thinking_tokens: 1_000_000 }, at)).toBeCloseTo(4.5)
    // Lite: 1M audio at $0.50 instead of $0.25.
    expect(callCostUsd('gemini-3.1-flash-lite', { input_tokens: 1_000_000, input_audio_tokens: 1_000_000, output_tokens: 0 }, at)).toBeCloseTo(0.5)
  })

  it('estimates customers × messages', () => {
    const per = callCostUsd('gemini-3.8-flash', TYPICAL_CHATBOT_TOKENS, new Date('2026-10-29'))
    const e = estimateChatbotCost(1000, 10, per)
    expect(e.replies).toBe(10_000)
    expect(e.usd).toBeCloseTo(10_000 * per)
  })
})

describe('usageFromMetadata', () => {
  it('reads tokens and the audio/image share of the input', () => {
    expect(
      usageFromMetadata({
        promptTokenCount: 900,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 200,
        promptTokensDetails: [
          { modality: 'TEXT', tokenCount: 400 },
          { modality: 'AUDIO', tokenCount: 500 },
        ],
      }),
    ).toEqual({ input_tokens: 900, input_audio_tokens: 500, input_image_tokens: 0, output_tokens: 50, thinking_tokens: 200 })
    expect(usageFromMetadata(undefined).input_tokens).toBe(0)
  })
})
