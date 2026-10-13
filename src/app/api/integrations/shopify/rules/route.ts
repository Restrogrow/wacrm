// ============================================================
// PUT /api/integrations/shopify/rules — Admin+.
//
// Save the event → template mapping:
//   { rules: [{ event, enabled, template_name, template_language,
//               body_variables: ["customer_name", …], delay_minutes }] }
// An enabled rule must name an approved template from this account.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  EVENT_META,
  isShopifyEvent,
  isShopifyVariable,
} from '@/lib/shopify/events';

interface RuleInput {
  event?: unknown;
  enabled?: unknown;
  template_name?: unknown;
  template_language?: unknown;
  body_variables?: unknown;
  delay_minutes?: unknown;
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
    const rows = [];
    for (const rule of body.rules) {
      if (!isShopifyEvent(rule.event)) {
        return NextResponse.json(
          { error: `Unknown event: ${String(rule.event)}` },
          { status: 400 }
        );
      }
      const label = EVENT_META[rule.event].label;
      const enabled = rule.enabled === true;
      const templateName =
        typeof rule.template_name === 'string' ? rule.template_name.trim() : '';
      const templateLanguage =
        typeof rule.template_language === 'string'
          ? rule.template_language.trim()
          : '';
      const variables = Array.isArray(rule.body_variables)
        ? rule.body_variables
        : [];
      if (!variables.every(isShopifyVariable)) {
        return NextResponse.json(
          { error: `${label}: unknown variable` },
          { status: 400 }
        );
      }
      const delay = Number(rule.delay_minutes ?? 60);
      if (!Number.isInteger(delay) || delay < 15 || delay > 10080) {
        return NextResponse.json(
          { error: `${label}: delay must be between 15 minutes and 7 days` },
          { status: 400 }
        );
      }

      if (enabled) {
        if (!templateName) {
          return NextResponse.json(
            { error: `${label}: choose a template` },
            { status: 400 }
          );
        }
        const { data: template } = await db
          .from('message_templates')
          .select('status')
          .eq('account_id', ctx.accountId)
          .eq('name', templateName)
          .eq('language', templateLanguage || 'en_US')
          .maybeSingle();
        if (!template || String(template.status).toUpperCase() !== 'APPROVED') {
          return NextResponse.json(
            { error: `${label}: "${templateName}" isn't an approved template` },
            { status: 400 }
          );
        }
      }

      rows.push({
        account_id: ctx.accountId,
        event: rule.event,
        enabled,
        template_name: templateName || null,
        template_language: templateLanguage || null,
        body_variables: variables,
        delay_minutes: delay,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await db
        .from('shopify_event_rules')
        .upsert(rows, { onConflict: 'account_id,event' });
      if (error) {
        console.error('[shopify/rules] save failed:', error.message);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
