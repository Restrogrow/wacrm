// Languages offered by "Translate" in the inbox. Client-safe (no server
// imports) so the composer and message toolbar can list them.

export const TRANSLATE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hinglish', label: 'Hinglish (Hindi in English letters)' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'or', label: 'Odia' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
] as const;

export type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number]['code'];

export function isTranslateLanguage(value: unknown): value is TranslateLanguage {
  return typeof value === 'string' && TRANSLATE_LANGUAGES.some((l) => l.code === value);
}

export function languageLabel(code: TranslateLanguage): string {
  return TRANSLATE_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Longest text we translate in one go (a long WhatsApp message). */
export const MAX_TRANSLATE_CHARS = 4000;

export interface ConversationSummary {
  /** 2–4 plain sentences: who the customer is and what happened. */
  summary: string;
  /** What the customer wants, in one line. */
  customer_wants: string;
  /** Up to five short facts worth knowing (order number, budget, date…). */
  key_points: string[];
  /** The single most useful next step for the agent. */
  next_step: string;
  /** Language the customer writes in, e.g. "Hindi" or "English". */
  customer_language: string;
  mood: 'happy' | 'neutral' | 'unhappy';
}
