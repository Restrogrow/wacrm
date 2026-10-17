// Shared error mapping for the AI inbox routes, matching the existing
// translate / summary routes: friendly text, no stack traces, and Gemini's
// own error message (it never contains our key) so a bad model name or
// quota problem is visible.

import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/auth/account'
import { AiRateLimitError } from './gemini'
import { InboxAiError } from './inbox-ai'

export function aiErrorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof InboxAiError) return NextResponse.json({ error: err.message }, { status: 422 })
  if (err instanceof AiRateLimitError) {
    return NextResponse.json({ error: 'AI is busy. Try again in a minute.' }, { status: 429 })
  }
  if (err instanceof Error && /AI request failed|AI returned|AI declined/.test(err.message)) {
    console.error(`[${label}] AI error:`, err.message)
    const reason = err.message.replace(/^AI request failed \(\d+\): /, '').slice(0, 200)
    return NextResponse.json({ error: `${label} failed: ${reason}` }, { status: 502 })
  }
  return toErrorResponse(err)
}
