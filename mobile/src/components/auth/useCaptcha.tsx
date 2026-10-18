import { useCallback, useMemo, useRef, useState } from 'react';

import { TurnstileWebView, type TurnstileHandle } from '@/components/auth/TurnstileWebView';
import { TURNSTILE_SITE_KEY } from '@/config';

/**
 * token: current captcha token (null until solved)
 * widget: render inside the form
 * reset(): call after any failed attempt, tokens work only once
 * required: false when no site key is configured (captcha off)
 * captchaOptions: spread into Supabase auth `options`
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const ref = useRef<TurnstileHandle>(null);

  const reset = useCallback(() => {
    setToken(null);
    ref.current?.reset();
  }, []);

  const widget = useMemo(() => <TurnstileWebView ref={ref} onToken={setToken} />, []);

  return {
    token,
    reset,
    widget,
    required: !!TURNSTILE_SITE_KEY,
    captchaOptions: token ? { captchaToken: token } : {},
  };
}

/** Friendlier text for Supabase auth errors. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('captcha')) return 'Please complete the security check, then try again.';
  if (m.includes('invalid login')) return 'That email and password do not match. Please try again.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'No connection. Check your internet and try again.';
  return message;
}
