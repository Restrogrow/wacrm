// Client-safe constants for AI lead scoring (no server imports), shared by
// the scoring code and the inbox badge.

export const INTENTS = ['pricing', 'support', 'order_status', 'complaint', 'buying', 'other'] as const
export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export type Intent = (typeof INTENTS)[number]
export type Sentiment = (typeof SENTIMENTS)[number]

export interface LeadAnalysis {
  intent: Intent
  sentiment: Sentiment
  lead_score: number
}

export const INTENT_LABELS: Record<Intent, string> = {
  pricing: 'Asking price',
  support: 'Needs support',
  order_status: 'Order status',
  complaint: 'Complaint',
  buying: 'Ready to buy',
  other: 'General',
}
