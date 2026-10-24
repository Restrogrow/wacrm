// ============================================================
// Why did WhatsApp fail a message? Meta reports the reason only in the
// status webhook (errors[0]); the webhook stores it on the message as
// error_code / error_detail (migration 079). This turns it into a short
// line an agent can act on, shown on the red ✕ in the inbox.
// ============================================================

/** Plain-language hints for the codes we see most. */
const HINTS: Record<number, string> = {
  131026: 'The number is not on WhatsApp, or the customer must accept the latest WhatsApp terms.',
  131047: 'More than 24 hours since the customer last wrote. Send an approved template instead.',
  131042: 'Payment problem on the WhatsApp Business Account. Check billing in Meta Business Settings.',
  131049: 'Meta did not deliver this marketing message to keep engagement healthy (per-user marketing limit). Try again later.',
  131050: 'The customer has stopped marketing messages from you.',
  131051: 'This message type is not supported.',
  131052: 'Could not download the media the customer sent.',
  131053: 'Meta could not fetch or process the media. Check the link is public and direct, and the file is in a supported format (video: MP4 with H.264 video and AAC audio, under 16 MB; image: JPEG/PNG under 5 MB).',
  131056: 'Too many messages to this customer in a short time. Wait a little and try again.',
  131008: 'A required template parameter is missing.',
  131009: 'A template parameter value is not valid.',
  132000: 'The number of template variables does not match the template.',
  132001: 'The template does not exist in this language, or is not approved yet.',
  132005: 'The filled-in template text is too long.',
  132007: 'The template content breaks WhatsApp policy.',
  132012: 'A template variable or header is in the wrong format (for example a missing or wrong media header).',
  132015: 'The template is paused by Meta because of low quality.',
  132016: 'The template is disabled by Meta.',
  130472: "Not delivered: Meta is running an experiment on this customer's number (marketing messages).",
  130429: 'Meta rate limit reached. It will work again shortly.',
  131000: 'Something went wrong at WhatsApp. Try again.',
  131016: 'WhatsApp is temporarily unavailable. Try again.',
  368: 'The WhatsApp Business Account is restricted for policy violations.',
  470: 'More than 24 hours since the customer last wrote. Send an approved template instead.',
}

export function describeSendFailure(
  code: number | null | undefined,
  detail: string | null | undefined,
): string {
  const hint = code != null ? HINTS[code] : undefined
  const meta = detail?.trim()
  const parts: string[] = []
  if (hint) parts.push(hint)
  if (meta && meta !== hint) parts.push(`WhatsApp says: ${meta}`)
  if (parts.length === 0) parts.push('WhatsApp did not deliver this message. No reason was given.')
  if (code != null) parts.push(`(error ${code})`)
  return parts.join(' ')
}
