// ============================================================
// Shopify automation scheduling — the queue behind multi-step events.
// Server-only.
//
// Webhooks no longer send; they enqueue. Each enabled step of the
// event becomes a row in shopify_scheduled_messages with its own
// send_at, and the every-minute cron sends what's due. That buys three
// things the old send-on-webhook path couldn't give:
//
//   - follow-ups at all (30 min, then 7 h, then 24 h)
//   - a delay on every event, not just abandoned cart
//   - cancellation: when the order lands, the pending cart chase for
//     that checkout is killed before it embarrasses anyone
//
// Message content is resolved at ENQUEUE time, not send time. The
// webhook payload is long gone by the time a 24-hour step fires, and
// re-deriving the context from the stored order would produce a
// different message than the one the merchant set up — tracking
// numbers and totals change. So body params and the URL-button suffix
// are frozen into the row.
//
// Nothing here throws at the caller. A webhook that can't enqueue is
// logged and dropped, same as the old path, because Shopify will retry
// and a 500 costs us the whole delivery.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { isPhoneOptedOut } from '@/lib/contacts/opt-out';
import { normalizeIntegrationPhone } from '@/lib/integrations/phone';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import { HOLD_WAITING_TEXT } from '@/lib/whatsapp/billing-hold';
import {
  DEFAULT_TIMEZONE,
  addDays,
  isQuietHours,
  localNow,
  localToUtc,
  toMinutes,
} from '@/lib/journeys/core';

import {
  EVENT_META,
  isShopifyVariable,
  isUrlButtonVariable,
  resolveBodyParams,
  urlButtonParam,
  type MessageContext,
  type ShopifyEvent,
  type ShopifyVariable,
} from './events';
import {
  dedupeKey,
  schedulableSteps,
  sendAtFor,
  type DelayUnit,
  type MessageStep,
} from './steps';
import { STORE_COLUMNS, type ShopifyStore } from './store';

type Db = SupabaseClient;

/** How many times a failed send is retried before giving up. */
const MAX_ATTEMPTS = 3;

// ------------------------------------------------------------
// Loading an event's steps
// ------------------------------------------------------------

export async function loadSteps(
  db: Db,
  accountId: string,
  event: ShopifyEvent,
  includeDisabled = false
): Promise<MessageStep[]> {
  const { data, error } = await db
    .from('shopify_event_rules')
    .select(
      'step_order, enabled, template_name, template_language, body_variables, delay_minutes, delay_unit, url_button_variable'
    )
    .eq('account_id', accountId)
    .eq('event', event)
    .order('step_order', { ascending: true });

  // Table or columns missing (migration 039/093 not applied) reads as
  // "no automation", same as the old loadRule.
  if (error || !data) return [];

  return data
    .map((r, i) => ({
      step_order: typeof r.step_order === 'number' ? r.step_order : i,
      enabled: r.enabled === true,
      template_name: r.template_name ?? null,
      template_language: r.template_language ?? null,
      body_variables: Array.isArray(r.body_variables)
        ? (r.body_variables.filter(isShopifyVariable) as ShopifyVariable[])
        : [],
      delay_minutes:
        typeof r.delay_minutes === 'number' ? r.delay_minutes : 0,
      delay_unit: (r.delay_unit ?? 'minutes') as DelayUnit,
      url_button_variable: isUrlButtonVariable(r.url_button_variable)
        ? r.url_button_variable
        : null,
    }))
    .filter((s) => s.enabled || includeDisabled);
}

// ------------------------------------------------------------
// Dynamic URL buttons
// ------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type TemplateButton = Record<string, any>;

/**
 * Find the URL button that carries a `{{n}}` and work out the suffix to
 * send for it.
 *
 * Returns `null` when the template has no dynamic URL button at all —
 * that's not an error, it just means the mapping the merchant chose has
 * nothing to fill, so the send proceeds without button params.
 */
export function resolveUrlButton(
  buttons: unknown,
  variable: ShopifyVariable,
  ctx: MessageContext
): { index: number; value: string } | { error: string } | null {
  if (!Array.isArray(buttons)) return null;

  const index = buttons.findIndex(
    (b: TemplateButton) =>
      String(b?.type ?? '').toUpperCase() === 'URL' &&
      /\{\{\s*\d+\s*\}\}/.test(String(b?.url ?? ''))
  );
  if (index === -1) return null;

  const result = urlButtonParam(ctx[variable], buttons[index]?.url);
  if (!result.ok) return { error: result.reason };
  return { index, value: result.value };
}

// ------------------------------------------------------------
// Enqueue
// ------------------------------------------------------------

export interface ScheduleRequest {
  event: ShopifyEvent;
  /**
   * Scopes the dedupe key — the checkout token for cart steps, the
   * Shopify order id for order steps. A webhook retry must produce the
   * same key so the insert collides instead of double-queueing.
   */
  entityKey: string;
  checkoutToken?: string | null;
  shopifyOrderId?: string | null;
  rawPhone: string | null;
  countryCode: string | null;
  customerName: string | null;
  ctx: MessageContext;
  /** Delays are measured from here. Defaults to now. */
  eventAt?: Date;
  /** Lets "COD order placed" fall back to the "Order placed" steps. */
  fallbackEvent?: ShopifyEvent;
}

export interface ScheduleOutcome {
  queued: number;
  /** Steps deliberately not queued, with why — surfaced in Settings. */
  skipped: Array<{ step: number; reason: string }>;
}

export async function scheduleShopifySteps(
  store: ShopifyStore,
  req: ScheduleRequest
): Promise<ScheduleOutcome> {
  const db = supabaseAdmin();
  const outcome: ScheduleOutcome = { queued: 0, skipped: [] };

  let event = req.event;
  let steps = schedulableSteps(await loadSteps(db, store.account_id, event));
  if (steps.length === 0 && req.fallbackEvent) {
    event = req.fallbackEvent;
    steps = schedulableSteps(await loadSteps(db, store.account_id, event));
  }
  if (steps.length === 0) return outcome;

  const phone = normalizeIntegrationPhone(
    req.rawPhone,
    req.countryCode,
    store.default_country_code
  );
  if (!phone) {
    await logSkip(db, store, event, req, {
      detail: req.rawPhone
        ? `Phone number "${req.rawPhone}" isn't a valid WhatsApp number`
        : 'No phone number on the order',
    });
    return outcome;
  }

  const eventAt = req.eventAt ?? new Date();

  // One template lookup per distinct template across the sequence —
  // needed for the URL button's registered prefix.
  const templateCache = new Map<string, TemplateButton[] | null>();
  const buttonsOf = async (name: string): Promise<TemplateButton[] | null> => {
    if (templateCache.has(name)) return templateCache.get(name) ?? null;
    const { data } = await db
      .from('message_templates')
      .select('buttons')
      .eq('account_id', store.account_id)
      .eq('name', name)
      .maybeSingle<{ buttons: unknown }>();
    const buttons = Array.isArray(data?.buttons)
      ? (data.buttons as TemplateButton[])
      : null;
    templateCache.set(name, buttons);
    return buttons;
  };

  for (const step of steps) {
    const templateName = step.template_name;
    if (!templateName) continue;

    let urlParam: string | null = null;
    let urlIndex: number | null = null;
    if (step.url_button_variable) {
      const resolved = resolveUrlButton(
        await buttonsOf(templateName),
        step.url_button_variable,
        req.ctx
      );
      if (resolved && 'error' in resolved) {
        // Spec: a domain mismatch is skipped and logged, never
        // best-effort guessed into a link on the wrong site.
        outcome.skipped.push({ step: step.step_order, reason: resolved.error });
        await logSkip(db, store, event, req, {
          detail: `Step ${step.step_order + 1}: ${resolved.error}`,
          stepOrder: step.step_order,
        });
        continue;
      }
      urlParam = resolved?.value ?? null;
      urlIndex = resolved?.index ?? null;
    }

    const { data: row, error } = await db
      .from('shopify_scheduled_messages')
      .insert({
        account_id: store.account_id,
        store_id: store.id,
        event,
        step_order: step.step_order,
        checkout_token: req.checkoutToken ?? null,
        shopify_order_id: req.shopifyOrderId ?? null,
        phone,
        customer_name: req.customerName,
        body_params: resolveBodyParams(step.body_variables, req.ctx),
        url_button_param: urlParam,
        url_button_index: urlIndex,
        template_name: templateName,
        template_language: step.template_language || 'en_US',
        send_at: sendAtFor(eventAt, step.delay_minutes).toISOString(),
        dedupe_key: dedupeKey(event, step.step_order, req.entityKey),
      })
      .select('id')
      .single();

    if (error) {
      // Already queued by an earlier delivery of the same webhook.
      if (isUniqueViolation(error)) continue;
      console.error('[shopify] could not queue step:', error.message);
      continue;
    }
    outcome.queued++;

    // "Send immediately" shouldn't wait up to a minute for the cron —
    // an order confirmation a minute late is noticeable. Dispatch it
    // inline, still through the queue row so stats stay uniform.
    if (step.delay_minutes <= 0 && row) {
      await dispatchScheduled(db, row.id);
    }
  }

  return outcome;
}

/** Records a non-send in shopify_events so Settings can show why. */
async function logSkip(
  db: Db,
  store: ShopifyStore,
  event: ShopifyEvent,
  req: ScheduleRequest,
  opts: { detail: string; stepOrder?: number }
): Promise<void> {
  const suffix = opts.stepOrder === undefined ? '' : `:${opts.stepOrder}`;
  const { error } = await db.from('shopify_events').insert({
    account_id: store.account_id,
    store_id: store.id,
    delivery_id: `skip:${dedupeKey(event, opts.stepOrder ?? 0, req.entityKey)}${suffix}`,
    topic: 'scheduled',
    event,
    order_name: req.ctx.order_number,
    phone: req.rawPhone,
    status: 'skipped',
    detail: opts.detail,
  });
  // A duplicate just means we already logged this skip.
  if (error && !isUniqueViolation(error)) {
    console.error('[shopify] could not log skip:', error.message);
  }
}

// ------------------------------------------------------------
// Cancellation (the stop rule)
// ------------------------------------------------------------

/**
 * Kill pending steps. Used when an order arrives — the cart chase for
 * that checkout has to stop, or the customer who just paid gets "you
 * left something behind" seven hours later.
 *
 * Matches on checkout token when we have one, and falls back to the
 * phone number: a customer can abandon a cart on mobile and buy on
 * desktop, producing a different checkout token for the same person,
 * and that still has to cancel.
 */
export async function cancelPendingShopifySteps(args: {
  accountId: string;
  storeId: string;
  checkoutToken?: string | null;
  phone?: string | null;
  events: ShopifyEvent[];
  reason: string;
}): Promise<number> {
  const db = supabaseAdmin();
  if (args.events.length === 0) return 0;

  const patch = {
    status: 'cancelled' as const,
    detail: args.reason,
    updated_at: new Date().toISOString(),
  };

  let cancelled = 0;

  if (args.checkoutToken) {
    const { data } = await db
      .from('shopify_scheduled_messages')
      .update(patch)
      .eq('store_id', args.storeId)
      .eq('checkout_token', args.checkoutToken)
      .in('event', args.events)
      .eq('status', 'pending')
      .select('id');
    cancelled += data?.length ?? 0;
  }

  if (args.phone) {
    const { data } = await db
      .from('shopify_scheduled_messages')
      .update(patch)
      .eq('account_id', args.accountId)
      .eq('phone', args.phone)
      .in('event', args.events)
      .eq('status', 'pending')
      .select('id');
    cancelled += data?.length ?? 0;
  }

  return cancelled;
}

// ------------------------------------------------------------
// The worker
// ------------------------------------------------------------

interface ScheduledRow {
  id: string;
  account_id: string;
  store_id: string;
  event: ShopifyEvent;
  step_order: number;
  checkout_token: string | null;
  shopify_order_id: string | null;
  phone: string;
  customer_name: string | null;
  body_params: unknown;
  url_button_param: string | null;
  url_button_index: number | null;
  template_name: string;
  template_language: string;
  attempts: number;
}

const ROW_COLUMNS =
  'id, account_id, store_id, event, step_order, checkout_token, shopify_order_id, phone, customer_name, body_params, url_button_param, url_button_index, template_name, template_language, attempts';

/**
 * Send everything due. Called from the every-minute cron.
 *
 * Returns the number actually sent. Never throws — one bad row must not
 * stop the queue.
 */
export async function processDueShopifyMessages(limit = 50): Promise<number> {
  const db = supabaseAdmin();

  const { data: due, error } = await db
    .from('shopify_scheduled_messages')
    .select(ROW_COLUMNS)
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(limit)
    .returns<ScheduledRow[]>();

  // Table missing (migration 093 not applied) — nothing to do.
  if (error || !due || due.length === 0) return 0;

  // Quiet hours and the opt-out check are per account; cache both so a
  // batch of 50 for one store doesn't re-read them 50 times.
  const quietCache = new Map<string, { quiet: boolean; resumeAt: Date }>();

  let sent = 0;
  for (const row of due) {
    try {
      if (await deferForQuietHours(db, row, quietCache)) continue;
      if (await dispatchScheduled(db, row.id, row)) sent++;
    } catch (err) {
      console.error('[shopify] scheduled send blew up:', err);
    }
  }
  return sent;
}

/**
 * Marketing steps respect the account's Journeys quiet hours; order
 * notifications don't.
 *
 * A customer who checks out at 22:30 expects their confirmation at
 * 22:30 — holding a transactional message until 09:00 would be worse
 * than sending it. Cart chases, feedback asks and reorder nudges are
 * exactly what quiet hours exist for, so those get pushed to the end of
 * the window rather than skipped: the whole point of the step is that
 * it eventually arrives.
 */
async function deferForQuietHours(
  db: Db,
  row: ScheduledRow,
  cache: Map<string, { quiet: boolean; resumeAt: Date }>
): Promise<boolean> {
  if (!EVENT_META[row.event]?.marketing) return false;

  let state = cache.get(row.account_id);
  if (!state) {
    const { data } = await db
      .from('journey_settings')
      .select('timezone, quiet_start, quiet_end')
      .eq('account_id', row.account_id)
      .maybeSingle<{
        timezone: string | null;
        quiet_start: string | null;
        quiet_end: string | null;
      }>();

    const tz = data?.timezone || DEFAULT_TIMEZONE;
    const start = data?.quiet_start || '21:00';
    const end = data?.quiet_end || '09:00';
    const now = new Date();
    state = {
      quiet: isQuietHours(now, tz, start, end),
      resumeAt: quietWindowEnd(now, tz, start, end),
    };
    cache.set(row.account_id, state);
  }

  if (!state.quiet) return false;

  await db
    .from('shopify_scheduled_messages')
    .update({
      send_at: state.resumeAt.toISOString(),
      detail: 'Held for quiet hours',
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending');
  return true;
}

/** When the current quiet window ends, handling overnight windows. */
function quietWindowEnd(
  now: Date,
  tz: string,
  start: string,
  end: string
): Date {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const { date, minutes } = localNow(now, tz);
  if (s === null || e === null) return now;
  // Same-day window (09:00 → 17:00) always ends later today.
  if (s < e) return localToUtc(date, end, tz);
  // Overnight (21:00 → 09:00): before midnight it ends tomorrow,
  // after midnight it ends today.
  return minutes >= s
    ? localToUtc(addDays(date, 1), end, tz)
    : localToUtc(date, end, tz);
}

/**
 * Claim one queued message and send it.
 *
 * The claim is a conditional UPDATE from 'pending' to 'sending'. Two
 * overlapping cron runs both see the row as due, both try, and exactly
 * one gets a row back — that's the "never sent twice" guarantee at the
 * delivery end, with dedupe_key covering the enqueue end.
 */
export async function dispatchScheduled(
  db: Db,
  id: string,
  prefetched?: ScheduledRow
): Promise<boolean> {
  const { data: claimed } = await db
    .from('shopify_scheduled_messages')
    .update({
      status: 'sending',
      claimed_at: new Date().toISOString(),
      attempts: (prefetched?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select(ROW_COLUMNS)
    .maybeSingle<ScheduledRow>();

  // Someone else claimed it, or it was cancelled between the read and
  // the claim — which is the stop rule working.
  if (!claimed) return false;

  const finish = async (
    status: 'sent' | 'failed' | 'skipped' | 'pending',
    detail: string | null,
    whatsappMessageId?: string
  ): Promise<boolean> => {
    await db
      .from('shopify_scheduled_messages')
      .update({
        status,
        detail,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        whatsapp_message_id: whatsappMessageId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimed.id);
    return status === 'sent';
  };

  // The STOP rule. Re-checked here rather than only at enqueue: a
  // customer can reply STOP during the hours between step 1 and step 3,
  // and that has to stop the rest of the sequence.
  if (
    EVENT_META[claimed.event]?.marketing &&
    (await isPhoneOptedOut(db, claimed.account_id, claimed.phone))
  ) {
    return finish('skipped', 'Customer opted out of marketing messages');
  }

  const { data: store } = await db
    .from('shopify_stores')
    .select(STORE_COLUMNS)
    .eq('id', claimed.store_id)
    .eq('status', 'active')
    .maybeSingle<ShopifyStore>();
  if (!store) {
    return finish('skipped', 'Store is no longer connected');
  }

  try {
    const { conversationId } = await resolveConversationByPhone(
      db,
      claimed.account_id,
      claimed.phone,
      claimed.customer_name
    );

    const messageParams: Record<string, unknown> = {
      body: Array.isArray(claimed.body_params) ? claimed.body_params : [],
    };
    if (claimed.url_button_param !== null) {
      // Both the value and the button index were frozen at enqueue
      // time — Meta keys the button component by index, and re-reading
      // the template now could land on a different button if it was
      // edited mid-sequence.
      messageParams.buttonParams = {
        [claimed.url_button_index ?? 0]: claimed.url_button_param,
      };
    }

    const result = await sendMessageToConversation(db, claimed.account_id, {
      conversationId,
      messageType: 'template',
      templateName: claimed.template_name,
      templateLanguage: claimed.template_language || 'en_US',
      templateMessageParams: messageParams,
      // Shopify order messages are free on the App Store listing, so
      // they keep sending after the trial ends — same as the old path.
      planExempt: true,
    });

    if (result.held) {
      // Billing hold: it'll go out by itself once Meta can charge again.
      return finish('skipped', HOLD_WAITING_TEXT);
    }
    return finish('sent', null, result.whatsappMessageId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[shopify] ${claimed.event} step ${claimed.step_order} failed:`,
      detail
    );
    // Transient failures (Meta 5xx, a network blip) get another go on a
    // later run; a step that has already burned its attempts stays
    // failed rather than hammering Meta on every tick.
    const retry = claimed.attempts < MAX_ATTEMPTS;
    return finish(retry ? 'pending' : 'failed', detail);
  }
}
