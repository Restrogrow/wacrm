// ============================================================
// POST /api/whatsapp/calls/[id]/notes — AI notes for a finished call.
//
// Body: the call recording, raw bytes, Content-Type audio/ogg
// (recorded in the agent's browser only after they switch AI notes on).
// → 200 { notes: CallNotes, note_id }
//
// Only the agent who took or placed the call can send it. The audio is
// passed to Gemini once and never stored; the notes are saved on the
// contact (contact_notes) so the team sees them in the contact panel.
// ============================================================

import { NextResponse } from 'next/server'

import { AiRateLimitError } from '@/lib/ai/gemini'
import { CallNotesError, formatCallNote, MAX_CALL_AUDIO_BYTES, summarizeCallAudio } from '@/lib/ai/call-notes'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { toErrorResponse } from '@/lib/auth/account'
import { requireCallingAgent } from '@/lib/whatsapp/calling-server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCallingAgent()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

    const limit = checkRateLimit(`aiCallNotes:${ctx.userId}`, RATE_LIMITS.aiSummary)
    if (!limit.success) return rateLimitResponse(limit)

    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'audio/ogg') {
      return NextResponse.json({ error: 'Send the recording as audio/ogg.' }, { status: 415 })
    }
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > MAX_CALL_AUDIO_BYTES) {
      return NextResponse.json({ error: 'The recording is too long for AI notes.' }, { status: 413 })
    }

    const db = supabaseAdmin()
    const { data: call } = await db
      .from('whatsapp_calls')
      .select('id, direction, contact_id, customer_name, duration_seconds, answered_at, ended_at, answered_by, started_by')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    if (call.answered_by !== ctx.userId && call.started_by !== ctx.userId) {
      return NextResponse.json({ error: 'Only the agent on this call can add AI notes.' }, { status: 403 })
    }

    const audio = new Uint8Array(await request.arrayBuffer())
    if (audio.byteLength > MAX_CALL_AUDIO_BYTES) {
      return NextResponse.json({ error: 'The recording is too long for AI notes.' }, { status: 413 })
    }

    // Duration: Meta's figure if the call has ended, else from timestamps.
    let durationSeconds = (call.duration_seconds as number | null) ?? null
    if (!durationSeconds && call.answered_at) {
      const end = call.ended_at ? Date.parse(call.ended_at as string) : Date.now()
      durationSeconds = Math.max(0, Math.round((end - Date.parse(call.answered_at as string)) / 1000))
    }
    const direction = call.direction as 'inbound' | 'outbound'

    const notes = await summarizeCallAudio(audio, 'audio/ogg', {
      customerName: (call.customer_name as string | null) ?? '',
      direction,
      durationSeconds,
    })

    let noteId: string | null = null
    if (call.contact_id) {
      const { data: note, error } = await db
        .from('contact_notes')
        .insert({
          account_id: ctx.accountId,
          contact_id: call.contact_id,
          user_id: ctx.userId,
          note_text: formatCallNote(notes, { direction, durationSeconds }),
        })
        .select('id')
        .single()
      if (error) console.error('[call-notes] could not save note:', error.message)
      noteId = (note?.id as string | undefined) ?? null
    }

    return NextResponse.json({ notes, note_id: noteId })
  } catch (err) {
    if (err instanceof CallNotesError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof AiRateLimitError) return NextResponse.json({ error: 'AI is busy. Try again in a minute.' }, { status: 429 })
    if (err instanceof Error && /AI request failed|AI returned|AI declined/.test(err.message)) {
      const reason = err.message.replace(/^AI request failed \(\d+\): /, '').slice(0, 200)
      console.error('[call-notes] AI error:', err.message)
      return NextResponse.json({ error: `Could not write call notes: ${reason}` }, { status: 502 })
    }
    return toErrorResponse(err)
  }
}
