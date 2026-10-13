// Shared helpers for the calling API routes (server only).

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse, type AccountContext } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { CallingError } from '@/lib/whatsapp/calling'

/** Agents and above can place and answer calls. */
export async function requireCallingAgent(): Promise<AccountContext> {
  return requireRole('agent')
}

/** The customer's WhatsApp number for a conversation in this account. */
export async function customerForConversation(accountId: string, conversationId: string) {
  const { data } = await supabaseAdmin()
    .from('conversations')
    .select('id, contact_id, contacts ( id, phone, name )')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!data) throw new CallingError('Conversation not found.', 404)
  const contact = (Array.isArray(data.contacts) ? data.contacts[0] : data.contacts) as
    | { id: string; phone: string | null; name: string | null }
    | null
  const phone = (contact?.phone ?? '').replace(/[^\d]/g, '')
  if (!phone) {
    throw new CallingError(
      'This customer uses a WhatsApp username and hides their number, so you can’t call them. They can call you.',
      400,
      'no_phone',
    )
  }
  return { conversationId: data.id as string, contactId: contact?.id ?? null, phone, name: contact?.name ?? null }
}

export function callingErrorResponse(err: unknown): NextResponse {
  if (err instanceof CallingError) {
    return NextResponse.json({ error: err.message, code: err.code, meta_code: err.metaCode }, { status: err.status })
  }
  return toErrorResponse(err)
}
