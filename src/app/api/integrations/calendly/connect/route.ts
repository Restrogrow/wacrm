// ============================================================
// POST /api/integrations/calendly/connect — Admin+.
//
// { token } — a Calendly personal access token. We look up the user,
// create a webhook subscription (invitee.created / canceled / no-show)
// to this account's unique URL with a fresh signing key, and store
// both encrypted. Reconnecting replaces the old subscription.
// ============================================================

import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt, encrypt } from '@/lib/whatsapp/encryption';
import { publicOrigin } from '@/lib/public-origin';
import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  friendlyCalendlyError,
  getCurrentUser,
  type CalendlyUser,
} from '@/lib/calendly/api';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const body = (await request.json().catch(() => null)) as {
      token?: unknown;
    } | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (token.length < 20 || /\s/.test(token)) {
      return NextResponse.json(
        {
          error:
            'Paste the full personal access token from Calendly → Integrations → API & Webhooks',
        },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();
    const { data: existing } = await db
      .from('calendly_connections')
      .select('access_token, webhook_subscription_uri')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    const ingestToken = randomBytes(24).toString('base64url');
    const signingKey = randomBytes(32).toString('hex');
    let user: CalendlyUser;
    let subscriptionUri: string;
    try {
      user = await getCurrentUser(token);
      subscriptionUri = await createWebhookSubscription(
        token,
        user,
        `${publicOrigin()}/api/integrations/calendly/webhooks/${ingestToken}`,
        signingKey
      );
    } catch (err) {
      return NextResponse.json(
        { error: friendlyCalendlyError(err) },
        { status: 400 }
      );
    }

    // Replace a previous subscription so events don't arrive twice.
    if (existing?.webhook_subscription_uri && existing.access_token) {
      try {
        await deleteWebhookSubscription(
          decrypt(existing.access_token),
          existing.webhook_subscription_uri
        );
      } catch (err) {
        console.warn(
          '[calendly/connect] old subscription not removed:',
          friendlyCalendlyError(err)
        );
      }
    }

    const { error } = await db.from('calendly_connections').upsert(
      {
        account_id: ctx.accountId,
        calendly_user_uri: user.uri,
        organization_uri: user.current_organization,
        user_name: user.name,
        user_email: user.email,
        scheduling_url: user.scheduling_url,
        ingest_token: ingestToken,
        access_token: encrypt(token),
        signing_key: encrypt(signingKey),
        webhook_subscription_uri: subscriptionUri,
        connected_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' }
    );
    if (error) {
      console.error('[calendly/connect] save failed:', error.message);
      await deleteWebhookSubscription(token, subscriptionUri).catch(
        () => undefined
      );
      return NextResponse.json(
        { error: 'Failed to save the connection' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, user_name: user.name });
  } catch (err) {
    return toErrorResponse(err);
  }
}
