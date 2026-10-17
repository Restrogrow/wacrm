// Safety helpers for anything customer-written that is sent to the model.
//
// Customer text is untrusted DATA. Before it reaches Gemini we
//   1. redact secrets people paste into chats (cards, OTPs, passwords,
//      tokens), so they are never sent to a third party,
//   2. neutralise phrases that try to give the model instructions and
//      the angle brackets that could close our <chat> wrapper,
//   3. cap the size.
// The prompts also tell the model to treat the text as data.

/** Luhn checksum, so only real card-like numbers are redacted. */
export function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

export function redactSecrets(input: string): string {
  let text = input

  // Card numbers (13-19 digits, optional spaces/dashes) that pass Luhn.
  text = text.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => (luhnValid(m.replace(/[ -]/g, '')) ? '[card number]' : m))

  // Aadhaar-style 12 digits written in 3 groups of 4.
  text = text.replace(/\b\d{4} \d{4} \d{4}\b/g, '[id number]')

  // "OTP is 123456", "cvv: 123", "UPI pin 4321", "verification code 8841".
  text = text.replace(
    /\b(otp|one[- ]?time (?:password|code)|verification code|security code|cvv|cvc|upi pin|atm pin|pin)\b([^\d\n]{0,25})(\d{3,8})\b/gi,
    '$1$2[redacted]',
  )

  // "password: hunter2", "pwd = abc".
  text = text.replace(/\b(password|passwd|pwd|passcode)\b\s*(?:is|:|=)\s*\S+/gi, '$1: [redacted]')

  // API keys / bearer tokens / JWTs.
  text = text.replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, '[secret key]')
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [token]')
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
  text = text.replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[secret key]')

  return text
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |any |the |your )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|rules?)/gi,
  /disregard (?:all |any |the |your )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|rules?)/gi,
  /forget (?:all |any |the |your )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|rules?)/gi,
  /(?:reveal|show|print|repeat) (?:me )?(?:your |the )?(?:system|hidden|initial) (?:prompt|instructions?)/gi,
  /you are now (?:in )?(?:developer|dan|jailbreak|god) mode/gi,
  /\bsystem prompt\b/gi,
  /\bact as (?:an? )?(?:different|new) (?:ai|assistant|model)\b/gi,
]

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => {
    re.lastIndex = 0
    return re.test(text)
  })
}

export function neutraliseInjection(text: string): string {
  let out = text
  for (const re of INJECTION_PATTERNS) out = out.replace(re, '[…]')
  return out
}

/** Make text safe to place inside a <chat>…</chat> data block. */
export function neutraliseMarkup(text: string): string {
  return text.replace(/</g, '‹').replace(/>/g, '›')
}

/** Remove control characters and collapse runs of whitespace/blank lines. */
export function cleanWhitespace(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Full pipeline for one piece of customer-written text. */
export function prepareUntrustedText(text: string, maxChars: number): string {
  const cleaned = cleanWhitespace(neutraliseMarkup(neutraliseInjection(redactSecrets(text))))
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) + '…' : cleaned
}
