import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/demo-login — signs the visitor into the shared demo workspace.
 *
 * The login page calls this when someone types "demo" / "demo". The real
 * credentials live only in server env (DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD),
 * never in the browser bundle. Point them at an account in the demo workspace (sample data only, never a real customer; an
 * admin or agent, not the owner) because anyone on the internet can use it.
 * Unset env = feature off (404).
 */
export async function POST(request: Request) {
  const email = process.env.DEMO_LOGIN_EMAIL;
  const password = process.env.DEMO_LOGIN_PASSWORD;
  if (!email || !password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const limit = checkRateLimit(`demo-login:${getClientIp(request)}`, { limit: 20, windowMs: 60 * 60_000 });
  if (!limit.success) return rateLimitResponse(limit);

  // Supabase checks the captcha on every password sign-in once Attack Protection is on,
  // so the login page passes the visitor's Turnstile token along.
  const body = (await request.json().catch(() => null)) as { captchaToken?: unknown; mobile?: unknown } | null;
  const captchaToken = typeof body?.captchaToken === 'string' && body.captchaToken ? body.captchaToken : undefined;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) {
    console.error('[demo-login] sign-in failed:', error.message);
    return NextResponse.json({ error: 'The demo is unavailable right now. Please try again later.' }, { status: 503 });
  }
  // The native app has no cookies: hand it the session tokens so it can store them itself.
  if (body?.mobile === true && data.session) {
    return NextResponse.json({
      ok: true,
      session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    });
  }
  return NextResponse.json({ ok: true });
}
