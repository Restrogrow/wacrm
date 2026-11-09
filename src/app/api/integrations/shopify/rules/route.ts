// ============================================================
// PUT /api/integrations/shopify/rules — Admin+.
//
// Save each event's automation. An event is now a SEQUENCE of steps,
// each with its own template, variable mapping, delay and optional
// dynamic URL-button mapping:
//
//   { rules: [{ event, steps: [
//       { enabled, template_name, template_language,
//         body_variables: ["customer_name", …],
//         delay_minutes, delay_unit, url_button_variable }, … ] }] }
//
// The pre-093 single-rule shape ({ event, enabled, template_name, … }
// with no `steps`) is still accepted and saved as a one-step sequence,
// so a cached copy of the old Settings page keeps working instead of
// wiping the merchant's automations.
//
// An enabled step must name an APPROVED template belonging to this
// account, and its variable mapping must match that template's {{n}}
// count — see lib/shopify/steps.ts for why that's checked here rather
// than discovered by Meta hours later.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { EVENT_META, isShopifyEvent } from '@/lib/shopify/events';
import { validateSteps, type MessageStep } from '@/lib/shopify/steps';

interface RuleInput {
  event?: unknown;
  steps?: unknown;
  // Legacy single-rule fields, kept for old clients.
  enabled?: unknown;
  template_name?: unknown;
  template_language?: unknown;
  body_variables?: unknown;
  delay_minutes?: unknown;
}

/** Old payload → a one-step sequence. */
function stepsOf(rule: RuleInput): unknown {
  if (Array.isArray(rule.steps)) return rule.steps;
  return [
    {
      enabled: rule.enabled,
      template_name: rule.template_name,
      template_language: rule.template_language,
      body_variables: rule.body_variables,
      delay_minutes: rule.delay_minutes ?? 0,
      delay_unit: 'minutes',
      url_button_variable: null,
    },
  ];
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      rules?: RuleInput[];
    } | null;
    if (!Array.isArray(body?.rules)) {
      return NextResponse.json(
        { error: "'rules' must be an array" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // One read of the account's templates serves both checks below —
    // "is it approved" and "how many variables does it have".
    const { data: templates } = await db
      .from('message_templates')
      .select('name, language, status, body_text')
      .eq('account_id', ctx.accountId);

    const approved = new Set<string>();
    const bodyByName = new Map<string, string>();
    for (const t of templates ?? []) {
      if (String(t.status).toUpperCase() === 'APPROVED') {
        approved.add(`${t.name}:${t.language || 'en_US'}`);
      }
      if (!bodyByName.has(t.name)) {
        bodyByName.set(t.name, t.body_text ?? '');
      }
    }
    const bodyTextOf = (name: string) => bodyByName.get(name);

    // event → validated steps, built up before anything is written so a
    // bad step in the last event can't leave the first one half-saved.
    const perEvent: Array<{ event: string; steps: MessageStep[] }> = [];

    for (const rule of body.rules) {
      if (!isShopifyEvent(rule.event)) {
        return NextResponse.json(
          { error: `Unknown event: ${String(rule.event)}` },
          { status: 400 }
        );
      }
      const label = EVENT_META[rule.event].label;

      const result = validateSteps(stepsOf(rule), bodyTextOf);
      if (!result.ok) {
        return NextResponse.json(
          { error: `${label}: ${result.error}` },
          { status: 400 }
        );
      }

      for (const step of result.value) {
        if (!step.enabled || !step.template_name) continue;
        const key = `${step.template_name}:${step.template_language || 'en_US'}`;
        if (!approved.has(key)) {
          return NextResponse.json(
            {
              error: `${label}, step ${step.step_order + 1}: "${step.template_name}" isn't an approved template`,
            },
            { status: 400 }
          );
        }
      }

      perEvent.push({ event: rule.event, steps: result.value });
    }

    // Replace each event's steps wholesale. An upsert alone can't do
    // this: shrinking a 3-step sequence to 2 would leave step 3 behind
    // and it would keep firing. Delete-then-insert per event, which is
    // safe here because this is a settings save — one admin, one form,
    // no concurrent writers to race with.
    for (const { event, steps } of perEvent) {
      const { error: delErr } = await db
        .from('shopify_event_rules')
        .delete()
        .eq('account_id', ctx.accountId)
        .eq('event', event);
      if (delErr) {
        console.error('[shopify/rules] clear failed:', delErr.message);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }

      if (steps.length === 0) continue;

      const { error: insErr } = await db.from('shopify_event_rules').insert(
        steps.map((step) => ({
          account_id: ctx.accountId,
          event,
          step_order: step.step_order,
          enabled: step.enabled,
          template_name: step.template_name,
          template_language: step.template_language,
          body_variables: step.body_variables,
          delay_minutes: step.delay_minutes,
          delay_unit: step.delay_unit,
          url_button_variable: step.url_button_variable,
          updated_at: new Date().toISOString(),
        }))
      );
      if (insErr) {
        console.error('[shopify/rules] save failed:', insErr.message);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
