'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Minimal shape of the bits of the Facebook JS SDK this component uses.
// The SDK attaches itself to `window.FB` / `window.fbAsyncInit` at
// runtime; there's no official @types package for it.
interface FacebookLoginResponse {
  authResponse?: { code?: string };
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
      extras: { setup: Record<string, unknown> };
    }
  ) => void;
}
declare global {
  interface Window {
    FB?: FacebookSDK;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_VERSION = 'v21.0';
const FB_SDK_SCRIPT_ID = 'facebook-jssdk';

interface EmbeddedSignupSessionData {
  event?: string;
  waba_id?: string;
  phone_number_id?: string;
  business_id?: string;
  current_step?: string;
  error_message?: string;
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

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;

  useEffect(() => {
    if (!appId || !configId) return;

    async function tryExchange() {
      if (exchangedRef.current) return;
      const session = sessionDataRef.current;
      const code = codeRef.current;
      if (!session || !code) return;
      if (session.event !== 'FINISH' && session.event !== 'FINISH_ONLY_WABA') return;
      if (!session.waba_id || !session.phone_number_id) return;

      exchangedRef.current = true;
      setStatus('exchanging');
      try {
        const res = await fetch('/api/whatsapp/embedded-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            waba_id: session.waba_id,
            phone_number_id: session.phone_number_id,
            business_id: session.business_id,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Failed to complete WhatsApp connection');
          return;
        }
        toast.success(
          data.phone_info?.verified_name
            ? `Connected to ${data.phone_info.verified_name}. Add your 2-step PIN below to finish registration.`
            : 'WhatsApp connected. Add your 2-step PIN below to finish registration.',
          { duration: 10000 }
        );
        onConnected();
      } catch (err) {
        console.error('Embedded Signup exchange failed:', err);
        toast.error('Failed to complete WhatsApp connection');
      } finally {
        setStatus('idle');
        sessionDataRef.current = null;
        codeRef.current = null;
        exchangedRef.current = false;
      }
    }

    function handleMessage(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: EmbeddedSignupSessionData & { type?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== 'WA_EMBEDDED_SIGNUP') return;

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
    return () => window.removeEventListener('message', handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, configId]);

  if (!appId || !configId) return null;

  async function handleClick() {
    setStatus('loading-sdk');
    const FB = await loadFacebookSdk(appId!);
    setStatus('awaiting-popup');
    FB.login(
      (response) => {
        if (response.authResponse?.code) {
          codeRef.current = response.authResponse.code;
        } else {
          setStatus('idle');
        }
      },
      {
        config_id: configId!,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      }
    );
  }

  const busy = status !== 'idle';

  return (
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
  );
}
