import { API_BASE_URL } from '@/config';
import { supabase } from '@/lib/supabase';

export type DemoResult = { ok: true } | { ok: false; message: string; unavailable?: boolean };

/**
 * Signs into the shared demo workspace through the backend (the demo account's
 * password lives only on the server). Request: POST /api/demo-login
 * { captchaToken, mobile: true }. Response on success:
 * { ok: true, session: { access_token, refresh_token } }.
 */
export async function signInToDemo(captchaToken: string | null): Promise<DemoResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captchaToken, mobile: true }),
    });
  } catch {
    return { ok: false, message: 'No connection. Check your internet and try again.' };
  }
  if (res.status === 404) return { ok: false, message: 'The demo is not available right now.', unavailable: true };
  if (res.status === 429) return { ok: false, message: 'Too many tries. Please wait a little and try again.' };
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    session?: { access_token?: string; refresh_token?: string };
  };
  if (!res.ok || !json.session?.access_token || !json.session.refresh_token) {
    return { ok: false, message: json.error || 'The demo is unavailable right now. Please try again later.' };
  }
  const { error } = await supabase.auth.setSession({
    access_token: json.session.access_token,
    refresh_token: json.session.refresh_token,
  });
  if (error) return { ok: false, message: 'Could not open the demo. Please try again.' };
  return { ok: true };
}
