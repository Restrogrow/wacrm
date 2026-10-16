// ============================================================
// POST /api/inbox/messages/[id]/transcribe — Voice-note AI.
//
// Transcribes a customer's voice note: what was said (in their own
// language), an English translation, a one-line summary and a suggested
// reply. The result is kept on the message (messages.ai_transcript,
// migration 058) so it stays after Meta expires the audio and is never
// paid for twice. The audio itself is not stored.
//
// → 200 { voice: VoiceNoteAi, cached: boolean }
//
// Any signed-in member of the account can transcribe a voice note in
// their own business's chats. The message is read with the caller's
// RLS-scoped client plus an explicit account filter.
// ============================================================

import { NextResponse } from 'next/server'

import { AiRateLimitError } from '@/lib/ai/gemini'
import { InboxAiError } from '@/lib/ai/inbox-ai'
import { audioMime, mediaIdFromUrl, MAX_VOICE_NOTE_BYTES, transcribeVoiceNote, type VoiceNoteAi } from '@/lib/ai/voice-note'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { checkRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { decrypt } from '@/lib/whatsapp/encryption'
import { downloadMedia, getMediaUrl } from '@/lib/whatsapp/meta-api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getCurrentAccount()
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

    const limit = checkRateLimit(`aiTranscribe:${ctx.userId}`, RATE_LIMITS.aiTranscribe)
    if (!limit.success) return rateLimitResponse(limit)

    // The message, but only if its conversation belongs to this account.
    const { data: message } = await ctx.supabase
      .from('messages')
      .select('id, content_type, sender_type, media_url, ai_transcript, conversation:conversations!inner(account_id, contact:contacts(name))')
      .eq('id', id)
      .eq('conversation.account_id', ctx.accountId)
      .maybeSingle()
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    if (message.content_type !== 'audio' || message.sender_type !== 'customer') {
      return NextResponse.json({ error: 'Only a customer voice note can be transcribed.' }, { status: 400 })
    }

    if (message.ai_transcript) {
      return NextResponse.json({ voice: message.ai_transcript as VoiceNoteAi, cached: true })
    }

    const mediaId = mediaIdFromUrl(message.media_url as string | null)
    if (!mediaId) {
      return NextResponse.json({ error: 'This voice note’s audio is not available any more.' }, { status: 410 })
    }

    const { data: config } = await ctx.supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!config?.access_token) return NextResponse.json({ error: 'WhatsApp is not connected.' }, { status: 400 })
    const accessToken = decrypt(config.access_token as string)

    let audio: Uint8Array
    let mime: string
    try {
      const info = await getMediaUrl({ mediaId, accessToken })
      const { buffer, contentType } = await downloadMedia({ downloadUrl: info.url, accessToken })
      audio = new Uint8Array(buffer)
      mime = audioMime(contentType || info.mimeType)
    } catch {
      // Meta only keeps customer media for about 7 days.
      return NextResponse.json(
        { error: 'WhatsApp no longer has this voice note (media is kept for about 7 days).' },
        { status: 410 },
      )
    }
    if (audio.byteLength > MAX_VOICE_NOTE_BYTES) {
      return NextResponse.json({ error: 'This voice note is too long to transcribe.' }, { status: 413 })
    }

    const conv = (Array.isArray(message.conversation) ? message.conversation[0] : message.conversation) as
      | { contact?: { name?: string | null } | { name?: string | null }[] | null }
      | null
    const contact = Array.isArray(conv?.contact) ? conv?.contact[0] : conv?.contact
    const voice = await transcribeVoiceNote(audio, mime, { customerName: contact?.name ?? '' })

    const { error: saveError } = await supabaseAdmin()
      .from('messages')
      .update({ ai_transcript: voice, ai_transcript_at: new Date().toISOString() })
      .eq('id', id)
    // Needs migration 058; the result is still returned if it can't be kept.
    if (saveError) console.warn('[transcribe] could not keep the transcript:', saveError.message)

    return NextResponse.json({ voice, cached: false })
  } catch (err) {
    if (err instanceof InboxAiError) return NextResponse.json({ error: err.message }, { status: 422 })
    if (err instanceof AiRateLimitError) return NextResponse.json({ error: 'AI is busy. Try again in a minute.' }, { status: 429 })
    if (err instanceof Error && /AI request failed|AI returned|AI declined/.test(err.message)) {
      const reason = err.message.replace(/^AI request failed \(\d+\): /, '').slice(0, 200)
      console.error('[transcribe] AI error:', err.message)
      return NextResponse.json({ error: `Could not transcribe: ${reason}` }, { status: 502 })
    }
    return toErrorResponse(err)
  }
}
