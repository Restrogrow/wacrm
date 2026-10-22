// Shared helpers for the calling API routes (server only).

import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse, type AccountContext } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { currentNumberFilter, currentPhoneNumberId } from '@/lib/whatsapp/current-number'
import { CALLING_COEXISTENCE_HELP, CallingError, isCallingNotEnabledError, isCoexistenceCallingError } from '@/lib/whatsapp/calling'

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

/**
 * Same as customerForConversation, for a contact (Contacts page, pipeline
 * deals). Finds the contact's conversation, creating one if the lead has
 * never chatted, so the call shows up in the inbox like any other.
 */
export async function customerForContact(ctx: AccountContext, contactId: string) {
  const db = supabaseAdmin()
  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (!contact) throw new CallingError('Contact not found.', 404)

  // the current number's chat (migration 083)
  const scope = currentNumberFilter(await currentPhoneNumberId(db, ctx.accountId))
  const find = () => {
    let q = db.from('conversations').select('id').eq('account_id', ctx.accountId).eq('contact_id', contactId)
    if (scope) q = q.or(scope)
    return q.limit(1).maybeSingle()
  }
  let { data: conversation } = await find()
  if (!conversation) {
    const { data: created, error } = await db
      .from('conversations')
      .insert({ account_id: ctx.accountId, user_id: ctx.userId, contact_id: contactId })
      .select('id')
      .single()
    // Lost a race with the webhook or another tab: use their row.
    conversation = created ?? (await find()).data
    if (!conversation) {
      console.error('[calls] could not open a conversation for contact', contactId, error?.message)
      throw new CallingError('Could not open a chat for this contact.', 500)
    }
  }
  return customerForConversation(ctx.accountId, conversation.id as string)
}

export function callingErrorResponse(err: unknown): NextResponse {
  if (isCoexistenceCallingError(err)) {
    return NextResponse.json({ error: CALLING_COEXISTENCE_HELP, code: 'calling_unavailable' }, { status: 400 })
  }
  if (isCallingNotEnabledError(err)) {
    return NextResponse.json(
      {
        error: 'WhatsApp calling isn’t on for this number yet. An admin can turn it on in Settings → WhatsApp → WhatsApp calling.',
        code: 'calling_disabled',
      },
      { status: 400 },
    )
  }
  if (err instanceof CallingError) {
    return NextResponse.json({ error: err.message, code: err.code, meta_code: err.metaCode }, { status: err.status })
  }
  return toErrorResponse(err)
}
