'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Minimal shape of the bits of the Facebook JS SDK this component uses.
// The SDK attaches itself to `window.FB` / `window.fbAsyncInit` at
// runtime; there's no official @types package for it.
interface FacebookLoginResponse {
  authResponse?: { code?: string };
  status?: string;
  error_message?: string;
}
interface FacebookSDK {
  init: (opts: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    opts: {
      config_id: string;
      response_type: 'code';
      override_default_response_type: true;
      extras: {
        setup: Record<string, unknown>;
        /** 'whatsapp_business_app_onboarding' enables the coexistence (existing Business app number) path. */
        featureType?: string;
        /** Embedded Signup architecture version — v4 is the current unified flow; v2 is deprecated Oct 2026. */
        version?: string;
      };
    }
  ) => void;
}
declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_VERSION = 'v23.0';
const FB_SDK_SCRIPT_ID = 'facebook-jssdk';

interface EmbeddedSignupSessionData {
  event?: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  current_step?: string;
  error_message?: string;
  /**
   * Meta sets this on FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING — the
   * "coexistence" flow where the customer connected an EXISTING
   * WhatsApp Business app number instead of a fresh Cloud API number.
   * The session data may only carry waba_id in that case, so the
   * exchange waits for the phone number to arrive from the
   * phone_number_id lookup fallback (see the server route).
   */
  business_app_onboarding?: boolean;
}

function loadFacebookSdk(appId: string): Promise<FacebookSDK> {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: FB_SDK_VERSION,
      });
      resolve(window.FB!);
    };
    if (document.getElementById(FB_SDK_SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = FB_SDK_SCRIPT_ID;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });
}

interface EmbeddedSignupButtonProps {
  onConnected: () => void;
}

/**
 * "Connect with Facebook" button — Meta's Embedded Signup flow.
 *
 * Launches FB.login in a popup configured with our Facebook Login for
 * Business config_id. On completion Meta sends two pieces of data that
 * have to be joined before we can call the server:
 *   1. A postMessage (`WA_EMBEDDED_SIGNUP`) carrying waba_id/
 *      phone_number_id/business_id — listened for on `window`.
 *   2. FB.login's own callback, carrying the short-lived auth `code`.
 * These can arrive in either order, so both are stashed in refs and
 * the exchange fires once both are present.
 *
 * Requires NEXT_PUBLIC_META_APP_ID and NEXT_PUBLIC_META_CONFIG_ID to be
 * set — renders nothing if either is missing, so self-hosted instances
 * that haven't configured Embedded Signup yet just see the manual form.
 */
export function EmbeddedSignupButton({ onConnected }: EmbeddedSignupButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading-sdk' | 'awaiting-popup' | 'exchanging'>(
    'idle'
  );
  const sessionDataRef = useRef<EmbeddedSignupSessionData | null>(null);
  const codeRef = useRef<string | null>(null);
  const exchangedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Visible debug trace — mirrors every console.debug/error call below
  // into on-screen state so the raw Meta payload is readable without
  // opening DevTools. Capped at 20 entries; persists across attempts
  // within this page load so a failed run stays inspectable.
  type DebugEvent = { ts: string; label: string; data: unknown };
  const [debugLog, setDebugLog] = useState<DebugEvent[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const pushDebug = useCallback((label: string, data: unknown) => {
    setDebugLog((prev) =>
      [...prev, { ts: new Date().toLocaleTimeString(), label, data }].slice(-20)
    );
  }, []);

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

  /**
   * Lifted out of the message-listener effect so both arrival orders
   * trigger it: the WA_EMBEDDED_SIGNUP postMessage and FB.login's code
   * callback race each other and can land in either order. Previously
   * this only ran from the postMessage handler, so when the FINISH
   * event arrived before the code did, the exchange silently never
   * fired again once the code showed up — the flow just hung until the
   * watchdog toast.
   */
  const tryExchange = useCallback(async () => {
    if (exchangedRef.current) return;
    const session = sessionDataRef.current;
    const code = codeRef.current;
    if (!session || !code) return;
    const isBizAppOnboarding = session.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
    if (
      session.event !== 'FINISH' &&
      session.event !== 'FINISH_ONLY_WABA' &&
      !isBizAppOnboarding
    ) {
      // Intermediate progress events (business selection etc.) — wait for
      // the final one instead of exchanging.
      console.debug('[embedded-signup] intermediate signup event:', session.event, session.current_step);
      pushDebug('intermediate event', { event: session.event, current_step: session.current_step });
      return;
    }
    // Coexistence onboarding: Meta documents that the session may
    // only carry waba_id (no phone_number_id). The server resolves
    // the number via the WABA's phone_numbers edge, so waba_id is
    // the only hard requirement here.
    if (!session.waba_id) {
      console.error('[embedded-signup] FINISH event missing waba_id:', session);
      pushDebug('ERROR: FINISH missing waba_id — full session payload', session);
      toast.error(
        'Meta finished the signup but did not send the WhatsApp account IDs. Check that your Facebook Login configuration in the Meta app is a "Login for Business" config with WhatsApp permissions.',
        { duration: 15000 }
      );
      setShowDebug(true);
      return;
    }
    if (!isBizAppOnboarding && !session.phone_number_id) {
      console.error('[embedded-signup] FINISH event missing phone_number_id:', session);
      pushDebug('ERROR: FINISH missing phone_number_id — full session payload', session);
      toast.error(
        'Meta finished the signup but did not send the phone number ID. Check that your Facebook Login configuration in the Meta app is a "Login for Business" config with WhatsApp permissions.',
        { duration: 15000 }
      );
      setShowDebug(true);
      return;
    }

    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    exchangedRef.current = true;
    setStatus('exchanging');
    try {
      const res = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: session.waba_id,
          phone_number_id: session.phone_number_id || null,
          business_id: session.business_id,
          business_app_onboarding: isBizAppOnboarding,
        }),
      });
      const data = await res.json();
      pushDebug(`server exchange → HTTP ${res.status}`, data);
      if (!res.ok) {
        toast.error(data.error || 'Failed to complete WhatsApp connection');
        setShowDebug(true);
        return;
      }
      if (data.coexistence) {
        toast.success(
          data.phone_info?.verified_name
            ? `Connected to ${data.phone_info.verified_name} (WhatsApp Business app stays in sync). Importing chats and contacts in the background — keep the app open for a few minutes.`
            : 'Connected. Your WhatsApp Business app number is now linked — importing chats and contacts in the background.',
          { duration: 12000 }
        );
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Connected to ${data.phone_info.verified_name}. Add your 2-step PIN below to finish registration.`
            : 'WhatsApp connected. Add your 2-step PIN below to finish registration.',
          { duration: 10000 }
        );
      }
      onConnected();
    } catch (err) {
      console.error('Embedded Signup exchange failed:', err);
      pushDebug('ERROR: exchange request threw', err instanceof Error ? err.message : String(err));
      toast.error('Failed to complete WhatsApp connection');
      setShowDebug(true);
    } finally {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      setStatus('idle');
      sessionDataRef.current = null;
      codeRef.current = null;
      exchangedRef.current = false;
    }
  }, [onConnected, pushDebug]);

  useEffect(() => {
    if (!appId || !configId) return;

    function handleMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: EmbeddedSignupSessionData & { type?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;

      console.debug('[embedded-signup] WA_EMBEDDED_SIGNUP message:', data);
      pushDebug('WA_EMBEDDED_SIGNUP message received', data);

      if (data.event === 'CANCEL') {
        if (data.error_message) {
          toast.error(`Meta signup error: ${data.error_message}`);
        } else if (data.current_step) {
          toast.message('WhatsApp signup cancelled.');
        }
        sessionDataRef.current = null;
        setStatus('idle');
        return;
      }

      sessionDataRef.current = data;
      void tryExchange();
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    };
  }, [appId, configId, tryExchange, pushDebug]);

  if (!appId || !configId) return null;

  async function handleClick() {
    setDebugLog([]);
    setShowDebug(false);
    setStatus('loading-sdk');
    const FB = await loadFacebookSdk(appId!);
    setStatus('awaiting-popup');
    FB.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code;
          console.debug('[embedded-signup] received auth code from FB.login');
          pushDebug('FB.login callback: auth code received', { code_length: response.authResponse.code.length });
          // The WA_EMBEDDED_SIGNUP postMessage and this code can arrive in
          // either order — if the message already landed first, this is
          // the only thing that will ever trigger the exchange.
          void tryExchange();
          // If the WA_EMBEDDED_SIGNUP postMessage never arrives (wrong
          // configuration type / missing WhatsApp permissions in the Meta
          // app), the flow would hang silently — warn after a grace period.
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          watchdogRef.current = setTimeout(() => {
            if (!exchangedRef.current && codeRef.current) {
              pushDebug(
                'WATCHDOG: 15s elapsed with a code but no completed exchange',
                { last_session_data: sessionDataRef.current }
              );
              setShowDebug(true);
              toast.error(
                'Meta returned the login code but never confirmed the signup. This usually means the Facebook Login configuration in your Meta app is missing WhatsApp permissions or is not a "Login for Business" config.',
                { duration: 15000 }
              );
            }
          }, 15000);
        } else {
          console.error('[embedded-signup] FB.login returned no auth code:', response);
          pushDebug('ERROR: FB.login returned no auth code', response);
          setShowDebug(true);
          toast.error(
            response.error_message ||
              'Facebook login was cancelled or returned no authorization code. Check that this domain is allowlisted in your Meta app\'s Facebook Login settings.',
            { duration: 15000 }
          );
          setStatus('idle');
        }
      },
      {
        config_id: configId!,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          // featureType is what ENABLES the coexistence path — there is
          // no dashboard toggle for it. With this set, the Embedded
          // Signup popup offers "connect your existing WhatsApp
          // Business app account" (the FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING
          // session event) alongside the standard new-number flow.
          // Required on every launch, even with a v4 configuration —
          // v4 is selected by the Login-for-Business config, this
          // selector picks the Business-app path within it.
          featureType: 'whatsapp_business_app_onboarding',
          // v4 = current Embedded Signup architecture. Without this the
          // popup falls back to the legacy flow, which ignores
          // featureType and never shows the coexistence screen.
          // Meta deprecates the legacy flow on 2026-10-15.
          version: 'v4',
          // NOTE: sessionInfoVersion is deliberately NOT sent — it's a
          // v2-era override; a v4 configuration returns version-3
          // session info without it (our listener doesn't check the
          // version field).
        },
      }
    );
  }

  const busy = status !== 'idle';

  return (
    <div className="space-y-2">
      <Button
        onClick={handleClick}
        disabled={busy}
        className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {status === 'exchanging' ? 'Finishing connection...' : 'Waiting for Meta...'}
          </>
        ) : (
          <>
            <MessageCircle className="size-4" />
            Connect with Facebook
          </>
        )}
      </Button>

      {/* Raw diagnostic trace — every postMessage, FB.login callback, and
          server response from the run just made, readable without
          opening DevTools. Auto-opens on any error; always
          manually togglable so a successful run can still be inspected. */}
      {debugLog.length > 0 && (
        <div className="rounded border border-border bg-card/60">
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="w-full px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showDebug ? '▾' : '▸'} Debug trace ({debugLog.length} event{debugLog.length === 1 ? '' : 's'})
          </button>
          {showDebug && (
            <div className="max-h-80 overflow-y-auto border-t border-border px-3 py-2 space-y-2">
              {debugLog.map((entry, i) => (
                <div key={i} className="text-[11px]">
                  <p className="font-medium text-foreground">
                    {entry.ts} — {entry.label}
                  </p>
                  <pre className="mt-0.5 overflow-x-auto rounded bg-muted/60 p-1.5 text-muted-foreground">
                    {typeof entry.data === 'string'
                      ? entry.data
                      : JSON.stringify(entry.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
