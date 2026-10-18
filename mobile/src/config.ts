// Runtime configuration. EXPO_PUBLIC_* values are inlined at build time.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://repeatgrow.com').replace(/\/$/, '');
export const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';

/** Public site used for legal pages and the web app. */
export const SITE_URL = 'https://repeatgrow.com';
export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;
export const SUPPORT_EMAIL = 'support@repeatgrow.com';
