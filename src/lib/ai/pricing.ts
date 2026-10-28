// ============================================================
// Gemini prices and cost maths for /admin/ai-usage. Pure.
//
// Paid-tier Standard prices in USD per 1M tokens, from
// https://ai.google.dev/gemini-api/docs/pricing (checked 29 Oct 2026).
// Gemini 3.8 / 3.6 Flash are on an introductory price until 31 Dec 2026
// and double on 1 Jan 2027. Update this table when Google changes it.
// ============================================================

export interface ModelPrice {
  /** Text / image / video input. */
  input: number
  /** Audio input (voice notes); same as input when Google lists one rate. */
  audioInput: number
  /** Output, thinking tokens included. */
  output: number
}

interface PriceRow extends ModelPrice {
  /** First day (UTC, inclusive) this price applies. */
  from?: string
}

const PRICES: Record<string, PriceRow[]> = {
  'gemini-3.8-flash': [
    { input: 0.75, audioInput: 0.75, output: 3.75 },
    { from: '2027-01-01', input: 1.5, audioInput: 1.5, output: 7.5 },
  ],
  'gemini-3.6-flash': [
    { input: 0.75, audioInput: 0.75, output: 3.75 },
    { from: '2027-01-01', input: 1.5, audioInput: 1.5, output: 7.5 },
  ],
  'gemini-3.5-flash-lite': [{ input: 0.3, audioInput: 0.3, output: 2.5 }],
  'gemini-3.1-flash-lite': [{ input: 0.25, audioInput: 0.5, output: 1.5 }],
  'gemini-3-flash-preview': [{ input: 0.5, audioInput: 1, output: 3 }],
}

/** Gemini Live (AI voice calls), USD per minute of audio. */
export const LIVE_PRICE_PER_MINUTE = { audioIn: 0.005, audioOut: 0.018 }

/** Rough USD → INR for display. */
export const USD_TO_INR = 88

/** Price for a model on a day; unknown models use the default model's price. */
export function modelPrice(model: string, at: Date = new Date()): ModelPrice & { known: boolean } {
  const rows = PRICES[model]
  const list = rows ?? PRICES['gemini-3.8-flash']
  const day = at.toISOString().slice(0, 10)
  let pick = list[0]
  for (const r of list) if (!r.from || r.from <= day) pick = r
  return { input: pick.input, audioInput: pick.audioInput, output: pick.output, known: Boolean(rows) }
}

export interface TokenCounts {
  input_tokens: number
  input_audio_tokens?: number
  output_tokens: number
  thinking_tokens?: number
}

/** USD cost of one call. Thinking tokens are billed as output. */
export function callCostUsd(model: string, t: TokenCounts, at?: Date): number {
  const p = modelPrice(model, at)
  const audio = Math.min(t.input_audio_tokens ?? 0, t.input_tokens)
  const text = t.input_tokens - audio
  const out = t.output_tokens + (t.thinking_tokens ?? 0)
  return (text * p.input + audio * p.audioInput + out * p.output) / 1_000_000
}

export interface Estimate {
  customers: number
  messagesPerCustomer: number
  replies: number
  usd: number
  inr: number
}

/** What N customers × M messages would cost, from an average cost per bot reply. */
export function estimateChatbotCost(customers: number, messagesPerCustomer: number, usdPerReply: number): Estimate {
  const replies = Math.max(0, Math.round(customers)) * Math.max(0, Math.round(messagesPerCustomer))
  const usd = replies * usdPerReply
  return { customers, messagesPerCustomer, replies, usd, inr: usd * USD_TO_INR }
}

/**
 * Typical chatbot reply when there is no real data yet: a ~3,000-token
 * prompt (rules + a medium knowledge base + recent chat), a ~120-token
 * answer and ~300 tokens of low thinking.
 */
export const TYPICAL_CHATBOT_TOKENS: TokenCounts = { input_tokens: 3000, output_tokens: 120, thinking_tokens: 300 }
