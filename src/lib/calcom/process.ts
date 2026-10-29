// ============================================================
// Cal.com webhook processing + booking reminders -> WhatsApp template
// sends. Server-only. Mirrors lib/calendly/process.ts.
//
//   BOOKING_CREATED      store the booking; send "Booking confirmed"
//   BOOKING_RESCHEDULED  mark the old booking cancelled, store the new
//                        one; send "Booking rescheduled"
//   BOOKING_CANCELLED    mark cancelled; send "Booking cancelled"
//   cron (every minute)  "Reminder - 24 hours / 1 hour before"
//
// Idempotency: each delivery is recorded once, and every send claims a
// "send:<event>:<booking uid>" row first. A unique violation means it was
// already handled (Cal.com retries, or the cron overlapping itself).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { recordWebhookFailure } from '@/lib/ops/monitoring';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { HOLD_WAITING_TEXT } from '@/lib/whatsapp/billing-hold';

import {
  bookingContext,
  bookingFields,
  isCalComVariable,
  reminderDue,
  resolveCalComParams,
  type BookingContext,
  type CalComEvent,
  type CalComVariable,
} from './events';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

export interface CalComConnection {
  id: string;
  account_id: string;
  default_country_code: string;
  phone_field: string | null;
  booking_page: string;
  status: 'active' | 'disconnected';
}

export const CALCOM_CONNECTION_COLUMNS =
  'id, account_id, default_country_code, phone_field, booking_page, status';

interface EventRule {
  template_name: string;
  template_language: string | null;
  body_variables: unknown;
}

async function loadRule(
  db: SupabaseClient,
  accountId: string,
  event: CalComEvent,
  includeDisabled = false
): Promise<EventRule | null> {
  const { data } = await db
    .from('calcom_event_rules')
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

export interface CalComSendRequest {
  event: CalComEvent;
  /** Unique per logical message, e.g. "reminder_1h:<booking uid>". */
  sendKey: string;
  topic: string;
  rawPhone: string | null;
  attendeeName: string | null;
  ctx: BookingContext;
}

export type CalComSendOutcome =
  | { status: 'sent'; whatsappMessageId: string }
  | { status: 'skipped' | 'failed'; detail: string }
  | { status: 'no_rule' | 'duplicate' };

export async function sendCalComEvent(
  conn: CalComConnection,
  req: CalComSendRequest,
  options: { test?: boolean } = {}
): Promise<CalComSendOutcome> {
  const db = supabaseAdmin();
  const rule = await loadRule(db, conn.account_id, req.event, options.test);
  if (!rule) return { status: 'no_rule' };

  const phone = normalizeIntegrationPhone(req.rawPhone, null, conn.default_country_code);

  const { data: claim, error: claimErr } = await db
    .from('calcom_events')
    .insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: `send:${req.sendKey}`,
      topic: req.topic,
      event: req.event,
      attendee_name: req.attendeeName,
      phone,
      status: 'received',
    })
    .select('id')
    .single();
  if (claimErr) {
    if (isUniqueViolation(claimErr)) return { status: 'duplicate' };
    console.error('[calcom] could not log send:', claimErr.message);
    return { status: 'failed', detail: claimErr.message };
  }

  const finish = async (outcome: CalComSendOutcome): Promise<CalComSendOutcome> => {
    await db
      .from('calcom_events')
      .update({
        status: outcome.status,
        detail: 'detail' in outcome ? outcome.detail : null,
        whatsapp_message_id: outcome.status === 'sent' ? outcome.whatsappMessageId : null,
      })
      .eq('id', claim.id);
    return outcome;
  };

  if (!phone) {
    return finish({
      status: 'skipped',
      detail: req.rawPhone
        ? `Phone number "${req.rawPhone}" isn't a valid WhatsApp number`
        : 'No phone number on the booking. Add a "Phone number" question to your Cal.com event type.',
    });
  }

  const variables: CalComVariable[] = Array.isArray(rule.body_variables)
    ? rule.body_variables.filter(isCalComVariable)
    : [];

  try {
    const { conversationId } = await resolveConversationByPhone(
      db,
      conn.account_id,
      phone,
      req.attendeeName
    );
    const result = await sendMessageToConversation(db, conn.account_id, {
      conversationId,
      messageType: 'template',
      templateName: rule.template_name,
      templateLanguage: rule.template_language || 'en_US',
      templateMessageParams: { body: resolveCalComParams(variables, req.ctx) },
    });
    // Billing hold: saved and sent automatically once Meta can charge again.
    if (result.held) return finish({ status: 'skipped', detail: HOLD_WAITING_TEXT });
    return finish({ status: 'sent', whatsappMessageId: result.whatsappMessageId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[calcom] ${req.event} send failed:`, detail);
    return finish({ status: 'failed', detail });
  }
}

// ------------------------------------------------------------
// Webhooks
// ------------------------------------------------------------

/** Process one verified webhook delivery. Never throws. */
export async function handleCalComWebhook(
  conn: CalComConnection,
  trigger: string,
  createdAt: string | null,
  payload: Json
): Promise<void> {
  const db = supabaseAdmin();
  try {
    const uid = typeof payload.uid === 'string' ? payload.uid : '';
    const { error: dupErr } = await db.from('calcom_events').insert({
      account_id: conn.account_id,
      connection_id: conn.id,
      delivery_id: `${trigger}:${uid}:${createdAt ?? ''}`,
      topic: trigger,
      attendee_name: Array.isArray(payload.attendees) ? (payload.attendees[0]?.name ?? null) : null,
      status: 'received',
    });
    if (dupErr && isUniqueViolation(dupErr)) return; // Cal.com retry

    await db
      .from('calcom_connections')
      .update({ last_event_at: new Date().toISOString() })
      .eq('id', conn.id);

    const fields = bookingFields(payload, conn.phone_field);
    if (!fields) return;
    const ctx = bookingContext(fields, conn.booking_page);
    const base = {
      topic: trigger,
      rawPhone: fields.phone,
      attendeeName: fields.attendee_name,
      ctx,
    };

    if (trigger === 'BOOKING_CREATED' || trigger === 'BOOKING_RESCHEDULED') {
      const { error } = await db.from('calcom_bookings').upsert(
        {
          account_id: conn.account_id,
          connection_id: conn.id,
          ...fields,
          status: 'active',
          booked_at: createdAt && !Number.isNaN(Date.parse(createdAt)) ? createdAt : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id,booking_uid' }
      );
      if (error) console.error('[calcom] booking upsert failed:', error.message);

      const oldUid = typeof payload.rescheduleUid === 'string' ? payload.rescheduleUid : '';
      if (trigger === 'BOOKING_RESCHEDULED' && oldUid && oldUid !== fields.booking_uid) {
        await db
          .from('calcom_bookings')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('connection_id', conn.id)
          .eq('booking_uid', oldUid);
      }

      const kind: CalComEvent = trigger === 'BOOKING_RESCHEDULED' ? 'booking_rescheduled' : 'booking_confirmed';
      await sendCalComEvent(conn, { ...base, event: kind, sendKey: `${kind}:${fields.booking_uid}` });
      return;
    }

    if (trigger === 'BOOKING_CANCELLED') {
      await db
        .from('calcom_bookings')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('connection_id', conn.id)
        .eq('booking_uid', fields.booking_uid);
      await sendCalComEvent(conn, {
        ...base,
        event: 'booking_cancelled',
        sendKey: `booking_cancelled:${fields.booking_uid}`,
      });
    }
  } catch (err) {
    console.error(`[calcom] ${trigger} handling failed:`, err);
    await recordWebhookFailure('calcom', err, {
      accountId: conn.account_id,
      context: { trigger },
    });
  }
}

// ------------------------------------------------------------
// Reminders (every-minute cron)
// ------------------------------------------------------------

const REMINDERS: { event: CalComEvent; minutes: number; column: string }[] = [
  { event: 'reminder_24h', minutes: 24 * 60, column: 'reminder_24h_sent_at' },
  { event: 'reminder_1h', minutes: 60, column: 'reminder_1h_sent_at' },
];

/** Send due 24 h / 1 h reminders for accounts that switched them on. */
export async function processDueCalComReminders(limit = 25): Promise<number> {
  const db = supabaseAdmin();
  let sent = 0;

  for (const reminder of REMINDERS) {
    const { data: rules, error: rulesErr } = await db
      .from('calcom_event_rules')
      .select('account_id')
      .eq('event', reminder.event)
      .eq('enabled', true)
      .not('template_name', 'is', null);
    // Table missing (migration 072 not applied) or nothing enabled.
    if (rulesErr || !rules || rules.length === 0) continue;

    const now = Date.now();
    const { data: due } = await db
      .from('calcom_bookings')
      .select('*')
      .in('account_id', rules.map((r) => r.account_id as string))
      .eq('status', 'active')
      .is(reminder.column, null)
      .gt('start_time', new Date(now).toISOString())
      .lte('start_time', new Date(now + reminder.minutes * 60_000).toISOString())
      .order('start_time', { ascending: true })
      .limit(limit);

    for (const booking of due ?? []) {
      if (!reminderDue(booking.start_time, booking.booked_at, reminder.minutes, now)) continue;

      // Claim so an overlapping cron run can't remind twice.
      const { data: claimed } = await db
        .from('calcom_bookings')
        .update({ [reminder.column]: new Date().toISOString() })
        .eq('id', booking.id)
        .is(reminder.column, null)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;

      const { data: conn } = await db
        .from('calcom_connections')
        .select(CALCOM_CONNECTION_COLUMNS)
        .eq('id', booking.connection_id)
        .maybeSingle<CalComConnection>();
      if (!conn || conn.status !== 'active') continue;

      const outcome = await sendCalComEvent(conn, {
        event: reminder.event,
        sendKey: `${reminder.event}:${booking.booking_uid}`,
        topic: 'reminder',
        rawPhone: booking.phone,
        attendeeName: booking.attendee_name,
        ctx: bookingContext(booking, conn.booking_page),
      });
      if (outcome.status === 'sent') sent++;
    }
  }
  return sent;
}
