'use client';

// Cloudflare Turnstile captcha for the sign-in forms.
//
// Renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, and the token is
// only sent to Supabase as `captchaToken`. While Supabase's Attack Protection
// captcha is switched off the token is ignored, so shipping this is safe;
// once it is switched on (Supabase dashboard > Authentication > Attack
// Protection) Supabase rejects any request without a valid token.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SCRIPT_SRC;
      el.async = true;
      el.defer = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null; // allow a retry (e.g. after an ad blocker was paused)
        reject(new Error('Turnstile failed to load'));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

function TurnstileBox({
  onToken,
  widgetId,
}: {
  onToken: (token: string | null) => void;
  widgetId: MutableRefObject<string | undefined>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    let id: string | undefined;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'auto',
          callback: (t: string) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
        widgetId.current = id;
      })
      .catch(() => {
        /* blocked or offline: the form still works while captcha is off in Supabase */
      });
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
      widgetId.current = undefined;
    };
  }, [onToken, widgetId]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="flex min-h-[65px] justify-center" />;
}

/**
 * `token`: the current captcha token (null until solved).
 * `widget`: put this inside the form.
 * `reset()`: call after a failed attempt, because a token works only once.
 * `captchaOptions`: spread into Supabase auth `options`.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const widgetId = useRef<string | undefined>(undefined);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  return {
    token,
    reset,
    captchaOptions: token ? { captchaToken: token } : {},
    widget: <TurnstileBox onToken={setToken} widgetId={widgetId} />,
  };
}

/** Friendlier text when Supabase rejects the captcha. */
export function friendlyAuthError(message: string): string {
  return /captcha/i.test(message) ? 'Please complete the security check, then try again.' : message;
}
