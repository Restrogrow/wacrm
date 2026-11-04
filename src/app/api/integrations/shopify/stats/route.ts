// ============================================================
// GET /api/integrations/shopify/stats — any member.
//
// Per-step funnel for the Automatic messages section: how many of each
// step went out, how many landed, how many were read, and how many
// orders came back off the back of it.
//
// Scoped to the last 30 days. These numbers exist to answer "is step 3
// of my cart chase worth keeping", and a lifetime total answers that
// worse than a recent one — a sequence changed last month would be
// judged on messages the merchant no longer sends.
//
// On "clicked": Meta does not report taps on a template's URL button.
// Quick-reply taps come back as inbound messages, but a URL button is
// a plain link-out with no webhook, so there is no honest click number
// to show for the dynamic-URL steps and this endpoint doesn't invent
// one. `orders_recovered` is the outcome metric that actually matters
// and it IS exact — see shopify_orders.recovered_from_scheduled_id.
// ============================================================

import { NextResponse } from 'next/server';

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

const WINDOW_DAYS = 30;

export interface StepStats {
  event: string;
  step_order: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  skipped: number;
  orders_recovered: number;
}

function emptyStats(event: string, stepOrder: number): StepStats {
  return {
    event,
    step_order: stepOrder,
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    orders_recovered: 0,
  };
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const db = supabaseAdmin();

    const since = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60_000
    ).toISOString();

    const { data: rows, error } = await db
      .from('shopify_scheduled_messages')
      .select('id, event, step_order, status, whatsapp_message_id')
      .eq('account_id', ctx.accountId)
      .gte('created_at', since)
      .returns<
        Array<{
          id: string;
          event: string;
          step_order: number;
          status: string;
          whatsapp_message_id: string | null;
        }>
      >();

    // Migration 093 not applied yet — report nothing rather than 500,
    // same tolerance the rest of the Shopify code has for 039.
    if (error) {
      return NextResponse.json({ stats: [], window_days: WINDOW_DAYS });
    }

    const byKey = new Map<string, StepStats>();
    const statOf = (event: string, step: number): StepStats => {
      const key = `${event}:${step}`;
      let s = byKey.get(key);
      if (!s) {
        s = emptyStats(event, step);
        byKey.set(key, s);
      }
      return s;
    };

    const wamidToKey = new Map<string, string>();
    const scheduledIdToKey = new Map<string, string>();

    for (const row of rows ?? []) {
      const s = statOf(row.event, row.step_order);
      const key = `${row.event}:${row.step_order}`;
      scheduledIdToKey.set(row.id, key);

      switch (row.status) {
        case 'pending':
        case 'sending':
          s.queued++;
          break;
        case 'sent':
          s.sent++;
          if (row.whatsapp_message_id) {
            wamidToKey.set(row.whatsapp_message_id, key);
          }
          break;
        case 'failed':
          s.failed++;
          break;
        case 'cancelled':
          s.cancelled++;
          break;
        case 'skipped':
          s.skipped++;
          break;
        default:
          break;
      }
    }

    // delivered/read come from the message rows Meta's status webhook
    // updates. `read` implies delivered, so count it in both.
    const wamids = [...wamidToKey.keys()];
    for (let i = 0; i < wamids.length; i += 500) {
      const chunk = wamids.slice(i, i + 500);
      const { data: messages } = await db
        .from('messages')
        .select('whatsapp_message_id, status')
        .in('whatsapp_message_id', chunk)
        .returns<Array<{ whatsapp_message_id: string; status: string }>>();

      for (const m of messages ?? []) {
        const key = wamidToKey.get(m.whatsapp_message_id);
        if (!key) continue;
        const s = byKey.get(key);
        if (!s) continue;
        if (m.status === 'delivered' || m.status === 'read') s.delivered++;
        if (m.status === 'read') s.read++;
      }
    }

    // Orders credited to a step (see attributeRecoveredOrder).
    const scheduledIds = [...scheduledIdToKey.keys()];
    for (let i = 0; i < scheduledIds.length; i += 500) {
      const chunk = scheduledIds.slice(i, i + 500);
      const { data: recovered } = await db
        .from('shopify_orders')
        .select('recovered_from_scheduled_id')
        .eq('account_id', ctx.accountId)
        .in('recovered_from_scheduled_id', chunk)
        .returns<Array<{ recovered_from_scheduled_id: string }>>();

      for (const o of recovered ?? []) {
        const key = scheduledIdToKey.get(o.recovered_from_scheduled_id);
        if (!key) continue;
        const s = byKey.get(key);
        if (s) s.orders_recovered++;
      }
    }

    const stats = [...byKey.values()].sort(
      (a, b) =>
        a.event.localeCompare(b.event) || a.step_order - b.step_order
    );

    return NextResponse.json({ stats, window_days: WINDOW_DAYS });
  } catch (err) {
    return toErrorResponse(err);
  }
}
