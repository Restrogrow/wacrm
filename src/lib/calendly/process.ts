// ============================================================
// Calendly webhook processing + booking reminders → WhatsApp
// template sends. Server-only.
//
//   invitee.created          store the booking; send "Booking
//                            rescheduled" (when it replaces an old
//                            invitee) or "Booking confirmed"
//   invitee.canceled         mark cancelled; send "Booking cancelled"
//                            unless it was cancelled by a reschedule
//   invitee_no_show.created  send "No-show follow-up"
//   cron (every minute)      "Reminder — 24 hours / 1 hour before"
//
// Idempotency: each delivery is recorded once, and every send claims a
// "send:<event>:<invitee>" row first — a unique-violation means it was
// already handled (Calendly retries, or the cron overlapping itself).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';

import {
  bookingContext,
  bookingFields,
  isCalendlyVariable,
  reminderDue,
  resolveBookingParams,
  type BookingContext,
  type CalendlyEvent,
  type CalendlyVariable,
} from './events';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export interface CalendlyConnection {
  id: string;
  account_id: string;
  scheduling_url: string | null;
  default_country_code: string;
  phone_question: string | null;
}

export const CONNECTION_COLUMNS =
  'id, account_id, scheduling_url, default_country_code, phone_question';

interface EventRule {
  template_name: string;
  template_language: string | null;
  body_variables: unknown;
}

async function loadRule(
  db: SupabaseClient,
  accountId: string,
  event: CalendlyEvent,
  includeDisabled = false
): Promise<EventRule | null> {
  const { data } = await db
    .from('calendly_event_rules')
    .select('enabled, template_name, template_language, body_variables')
    .eq('account_id', accountId)
    .eq('event', event)
    .maybeSingle();
  return data && (data.enabled || includeDisabled) && data.template_name
    ? (data as EventRule)
    : null;
}

// ------------------------------------------------------------
// Sending
// ------------------------------------------------------------

export interface CalendlySendRequest {
  event: CalendlyEvent;
  /** Unique per logical message, e.g. "reminder_1h:<invitee uri>". */
  sendKey: string;
  topic: string;
  rawPhone: string | null;
  inviteeName: string | null;
  ctx: BookingContext;
}

export type CalendlySendOutcome =
  | { status: 'sent'; whatsappMessageId: string }
  | { status: 'skipped' | 'failed'; detail: string }
  | { status: 'no_rule' | 'duplicate' };

export async function sendCalendlyEvent(
  conn: CalendlyConnection,
  req: CalendlySendRequest,
  options: { test?: boolean } = {}
): Promise<CalendlySendOutcome> {
  const db = supabaseAdmin();
  const rule = await loadRule(db, conn.account_id, req.event, options.test);
  if (!rule) return { status: 'no_rule' };

  const phone = normalizeIntegrationPhone(
    req.rawPhone,
    null,
    conn.default_country_code
  );

  const { data: claim, error: claimErr } = await db
    .from('calendly_events')
    .insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: `send:${req.sendKey}`,
      topic: req.topic,
      event: req.event,
      invitee_name: req.inviteeName,
      phone,
      status: 'received',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
    console.error('[calendly] could not log send:', claimErr.message);
    return { status: 'failed', detail: claimErr.message };
  }

  const finish = async (
    outcome: CalendlySendOutcome
  ): Promise<CalendlySendOutcome> => {
    await db
      .from('calendly_events')
      .update({
        status: outcome.status,
        detail: 'detail' in outcome ? outcome.detail : null,
        whatsapp_message_id:
          outcome.status === 'sent' ? outcome.whatsappMessageId : null,
      })
      .eq('id', claim.id);
    return outcome;
  };

  if (!phone) {
    return finish({
      status: 'skipped',
      detail: req.rawPhone
        ? `Phone number "${req.rawPhone}" isn't a valid WhatsApp number`
        : 'No phone number on the booking — add a "Phone number" question to your Calendly event',
    });
  }

  const variables: CalendlyVariable[] = Array.isArray(rule.body_variables)
    ? rule.body_variables.filter(isCalendlyVariable)
    : [];

  try {
    const { conversationId } = await resolveConversationByPhone(
      db,
      conn.account_id,
      phone,
      req.inviteeName
    );
    const result = await sendMessageToConversation(db, conn.account_id, {
      conversationId,
      messageType: 'template',
      templateName: rule.template_name,
      templateLanguage: rule.template_language || 'en_US',
      templateMessageParams: { body: resolveBookingParams(variables, req.ctx) },
    });
    return finish({
      status: 'sent',
      whatsappMessageId: result.whatsappMessageId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[calendly] ${req.event} send failed:`, detail);
    return finish({ status: 'failed', detail });
  }
}

// ------------------------------------------------------------
// Webhooks
// ------------------------------------------------------------

/** Process one verified webhook delivery. Never throws. */
export async function handleCalendlyWebhook(
  conn: CalendlyConnection,
  event: string,
  createdAt: string | null,
  invitee: Json
): Promise<void> {
  const db = supabaseAdmin();
  try {
    const { error: dupErr } = await db.from('calendly_events').insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: `${event}:${invitee.uri ?? ''}:${createdAt ?? ''}`,
      topic: event,
      invitee_name: typeof invitee.name === 'string' ? invitee.name : null,
      status: 'received',
    });
    if (dupErr && isUniqueViolation(dupErr)) return; // Calendly retry

    await db
      .from('calendly_connections')
      .update({ last_event_at: new Date().toISOString() })
      .eq('id', conn.id);

    const fields = bookingFields(invitee, conn.phone_question);
    if (!fields) return;
    const ctx = bookingContext(fields, conn.scheduling_url);
    const base = {
      topic: event,
      rawPhone: fields.phone,
      inviteeName: fields.invitee_name,
      ctx,
    };

    if (event === 'invitee.created') {
      const { error } = await db.from('calendly_bookings').upsert(
        {
          account_id: conn.account_id,
          connection_id: conn.id,
          ...fields,
          status: 'active',
          booked_at: invitee.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id,invitee_uri' }
      );
      if (error)
        console.error('[calendly] booking upsert failed:', error.message);

      const rescheduled =
        typeof invitee.old_invitee === 'string' && invitee.old_invitee;
      if (rescheduled) {
        await db
          .from('calendly_bookings')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('connection_id', conn.id)
          .eq('invitee_uri', invitee.old_invitee);
      }
      const kind: CalendlyEvent = rescheduled
        ? 'booking_rescheduled'
        : 'booking_confirmed';
      await sendCalendlyEvent(conn, {
        ...base,
        event: kind,
        sendKey: `${kind}:${fields.invitee_uri}`,
      });
      return;
    }

    if (event === 'invitee.canceled') {
      await db
        .from('calendly_bookings')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('connection_id', conn.id)
        .eq('invitee_uri', fields.invitee_uri);
      // A reschedule cancels the old invitee and creates a new one; the
      // new invitee.created sends "Booking rescheduled" instead.
      if (invitee.rescheduled === true) return;
      await sendCalendlyEvent(conn, {
        ...base,
        event: 'booking_cancelled',
        sendKey: `booking_cancelled:${fields.invitee_uri}`,
      });
      return;
    }

    if (event === 'invitee_no_show.created') {
      await sendCalendlyEvent(conn, {
        ...base,
        event: 'no_show',
        sendKey: `no_show:${fields.invitee_uri}`,
      });
    }
  } catch (err) {
    console.error(`[calendly] ${event} handling failed:`, err);
  }
}

// ------------------------------------------------------------
// Reminders (every-minute cron)
// ------------------------------------------------------------

const REMINDERS: { event: CalendlyEvent; minutes: number; column: string }[] = [
  { event: 'reminder_24h', minutes: 24 * 60, column: 'reminder_24h_sent_at' },
  { event: 'reminder_1h', minutes: 60, column: 'reminder_1h_sent_at' },
];

/** Send due 24 h / 1 h reminders for accounts that switched them on. */
export async function processDueCalendlyReminders(limit = 25): Promise<number> {
  const db = supabaseAdmin();
  let sent = 0;

  for (const reminder of REMINDERS) {
    const { data: rules, error: rulesErr } = await db
      .from('calendly_event_rules')
      .select('account_id')
      .eq('event', reminder.event)
      .eq('enabled', true)
      .not('template_name', 'is', null);
    // Table missing (migration 040 not applied) or nothing enabled.
    if (rulesErr || !rules || rules.length === 0) continue;

    const now = Date.now();
    const { data: due } = await db
      .from('calendly_bookings')
      .select('*')
      .in(
        'account_id',
        rules.map((r) => r.account_id as string)
      )
      .eq('status', 'active')
      .is(reminder.column, null)
      .gt('start_time', new Date(now).toISOString())
      .lte(
        'start_time',
        new Date(now + reminder.minutes * 60_000).toISOString()
      )
      .order('start_time', { ascending: true })
      .limit(limit);

    for (const booking of due ?? []) {
      if (
        !reminderDue(
          booking.start_time,
          booking.booked_at,
          reminder.minutes,
          now
        )
      )
        continue;

      // Claim so an overlapping cron run can't remind twice.
      const { data: claimed } = await db
        .from('calendly_bookings')
        .update({ [reminder.column]: new Date().toISOString() })
        .eq('id', booking.id)
        .is(reminder.column, null)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;

      const { data: conn } = await db
        .from('calendly_connections')
        .select(CONNECTION_COLUMNS)
        .eq('id', booking.connection_id)
        .maybeSingle<CalendlyConnection>();
      if (!conn) continue;

      const outcome = await sendCalendlyEvent(conn, {
        event: reminder.event,
        sendKey: `${reminder.event}:${booking.invitee_uri}`,
        topic: 'reminder',
        rawPhone: booking.phone,
        inviteeName: booking.invitee_name,
        ctx: bookingContext(booking, conn.scheduling_url),
      });
      if (outcome.status === 'sent') sent++;
    }
  }
  return sent;
}
