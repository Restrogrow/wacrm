'use client';

import { IconChip } from '@/components/icon-chip';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Copy, CheckCircle2, XCircle, Loader2, ExternalLink, Zap, AlertTriangle, RotateCcw, Phone, PlugZap, KeyRound, Webhook, ListChecks, Check, ShieldCheck, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import { EmbeddedSignupButton } from './embedded-signup-button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it — so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Set when Embedded Signup finishes successfully — drives the
  // prominent confirmation banner (the toast alone kept getting
  // missed, and users were left unsure whether the popup "did").
  const [justConnected, setJustConnected] = useState(false);
  const [copied, setCopied] = useState<'webhook' | 'verify' | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [showManual, setShowManual] = useState(false);
  // Guards against re-hydrating the form when the load effect below
  // re-runs for reasons unrelated to actually switching accounts —
  // e.g. Supabase's onAuthStateChange fires a token refresh (new
  // `user` object, profileLoading flips true/false) when the browser
  // tab regains focus. Without this, that churn calls fetchConfig()
  // again and overwrites whatever the user typed but hadn't saved yet.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event — that's the
  // multi-number bug that prompted this work.
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  // PIN-only registration completion (POST /api/whatsapp/config/register)
  // — decrypts the already-stored token server-side, so it works for
  // Embedded Signup rows too, which have no access token the user could
  // re-paste into the main form.
  const [registerPin, setRegisterPin] = useState('');
  const [registeringPin, setRegisteringPin] = useState(false);

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type PhoneInfo = {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    name_status?: string;
    status?: string;
    code_verification_status?: string;
    platform_type?: string;
    account_mode?: string;
    is_official_business_account?: boolean;
    last_onboarded_time?: string;
    messaging_limit_tier?: string;
  };
  type CoexistenceStatus = {
    is_on_biz_app?: boolean;
    contacts_synced_at?: string | null;
    history_synced_at?: string | null;
    history_progress?: unknown;
    sync_error?: string | null;
  };
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    phone_info?: PhoneInfo | null;
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
    coexistence?: CoexistenceStatus;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);
  // The real Meta-verified phone number for the connected config —
  // shown next to Setup Instructions so "connected" means something
  // concrete (a phone number you recognize), not just a status badge.
  // Populated by whichever of fetchConfig / Save / Verify Registration
  // ran most recently; cleared on disconnect.
  const [phoneInfo, setPhoneInfo] = useState<PhoneInfo | null>(null);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      // Load form values from Supabase (shows what's in DB).
      // Switched from `user_id` (which would only match the row's
      // original author) to `account_id` so every member of the
      // account sees the same saved configuration. UNIQUE(account_id)
      // on the table guarantees the .maybeSingle() return type
      // remains accurate.
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        setPhoneNumberId(data.phone_number_id || '');
        setWabaId(data.waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);
        setPhoneInfo(null);
      }
      // Clear any stale probe result when reloading the row.
      setRegistrationProbe(null);

      // Then verify health via the API (decrypts token + pings Meta)
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
            setPhoneInfo(payload.phone_info ?? null);
          } else {
            setConnectionStatus('disconnected');
            setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
            setStatusMessage(payload.message || '');
            setPhoneInfo(null);
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
          setPhoneInfo(null);
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
        setPhoneInfo(null);
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user?.id || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API — it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional — only sent when the user filled it in. The server
        // requires it on first save or when changing numbers; for a
        // simple token rotation, leaving it blank skips re-register.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config — reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        setShowManual(true);
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      setPhoneInfo(data.phone_info ?? null);

      // The route now returns a structured outcome:
      //   * registered=true   → number is live, events will flow
      //   * registered=false  → credentials saved but /register
      //                         failed; UI shows the specific error
      //                         and a retry path. registration_error
      //                         is human-readable from Meta.
      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 },
        );
      } else if (data.registration_skipped) {
        // Credentials saved + verified, but /register was skipped
        // because no PIN was supplied (e.g. a Meta test number).
        // Don't claim the number is "Live" — point at the
        // Registration status banner instead.
        toast.success(
          'Credentials saved and verified. Inbound registration was skipped (no PIN) — see Registration status below.',
          { duration: 10000 },
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : 'WhatsApp connected. Events will start flowing within a minute.',
        );
        // Clear the PIN so subsequent saves don't accidentally
        // re-register (which would void the active subscription if
        // the PIN became stale).
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.phone_info) setPhoneInfo(data.phone_info);
      if (data.live) {
        toast.success('Number is fully wired — Meta is delivering events.');
      } else {
        toast.error(
          'Number is not fully registered. See the checks below for which step failed.',
          { duration: 8000 },
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleRegisterWithPin() {
    if (!/^\d{6}$/.test(registerPin)) {
      toast.error('PIN must be exactly 6 digits');
      return;
    }
    try {
      setRegisteringPin(true);
      const res = await fetch('/api/whatsapp/config/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: registerPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.registered) {
        toast.error(data.error || 'Registration failed');
        return;
      }
      toast.success('Registered — Meta will now deliver events to Repeat Grow.');
      setRegisterPin('');
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Register-with-PIN error:', err);
      toast.error('Failed to register with Meta');
    } finally {
      setRegisteringPin(false);
    }
  }

  async function handleReset() {
    try {
      setResetting(true);
      setConfirmingReset(false);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
      setPhoneInfo(null);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopy(kind: 'webhook' | 'verify', value: string) {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="WhatsApp connection"
          description="Connect your Meta WhatsApp Business API. Credentials, webhook, and setup steps all live here."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }


  const showResetBanner = resetReason === 'token_corrupted';
  const isLive = isRegistered && connectionStatus === 'connected';
  const steps = [
    { label: 'Number added', done: !!config },
    { label: 'Credentials valid', done: connectionStatus === 'connected' },
    { label: 'Registered with Meta', done: !!isRegistered },
    { label: 'Receiving messages', done: isLive },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const heroTone = isLive
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : config
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-border bg-card';
  const pretty = (v?: string | null) =>
    v ? v.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : null;
  const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleString() : null);
  const nameStatus = phoneInfo?.name_status?.toUpperCase();
  const quality = phoneInfo?.quality_rating?.toUpperCase();
  const codeStatus = phoneInfo?.code_verification_status?.toUpperCase();
  type Detail = { label: string; value: string; tone?: 'good' | 'warn' | 'bad'; mono?: boolean };
  const details: Detail[] = (
    [
      { label: 'Business / display name', value: phoneInfo?.verified_name },
      { label: 'Phone number', value: phoneInfo?.display_phone_number },
      nameStatus && {
        label: 'Name verification',
        value: nameStatus === 'APPROVED' ? 'Verified (approved by Meta)' : pretty(nameStatus),
        tone: nameStatus === 'APPROVED' ? 'good' : nameStatus.includes('DECLINED') || nameStatus.includes('EXPIRED') ? 'bad' : 'warn',
      },
      codeStatus && {
        label: 'Number verification',
        value: codeStatus === 'VERIFIED' ? 'Verified' : pretty(codeStatus),
        tone: codeStatus === 'VERIFIED' ? 'good' : 'warn',
      },
      quality && {
        label: 'Quality rating',
        value: quality === 'GREEN' ? 'High (green)' : quality === 'YELLOW' ? 'Medium (yellow)' : quality === 'RED' ? 'Low (red)' : pretty(quality),
        tone: quality === 'GREEN' ? 'good' : quality === 'YELLOW' ? 'warn' : quality === 'RED' ? 'bad' : undefined,
      },
      phoneInfo?.status && {
        label: 'Number status',
        value: pretty(phoneInfo.status),
        tone: phoneInfo.status.toUpperCase() === 'CONNECTED' ? 'good' : 'warn',
      },
      phoneInfo?.messaging_limit_tier && { label: 'Messaging limit', value: pretty(phoneInfo.messaging_limit_tier)?.replace('Tier ', 'Tier ') },
      phoneInfo?.platform_type && { label: 'Platform', value: pretty(phoneInfo.platform_type) },
      phoneInfo?.account_mode && { label: 'Account mode', value: pretty(phoneInfo.account_mode) },
      typeof phoneInfo?.is_official_business_account === 'boolean' && {
        label: 'Official business account',
        value: phoneInfo.is_official_business_account ? 'Yes' : 'No',
      },
      { label: 'Phone Number ID', value: config?.phone_number_id, mono: true },
      config?.waba_id && { label: 'Business Account ID', value: config.waba_id, mono: true },
      config?.registered_at && { label: 'Registered with Meta', value: fmtDate(config.registered_at) },
      phoneInfo?.last_onboarded_time && { label: 'Connected on', value: fmtDate(phoneInfo.last_onboarded_time) },
    ] as (Detail | false | null | undefined | { label: string; value?: string | null })[]
  ).filter((d): d is Detail => !!d && !!(d as Detail).value);
  const hasNewToken = tokenEdited && accessToken.trim() !== '' && accessToken !== MASKED_TOKEN;
  const isDirty =
    !config ||
    phoneNumberId.trim() !== (config.phone_number_id || '') ||
    wabaId.trim() !== (config.waba_id || '') ||
    hasNewToken ||
    verifyToken.trim() !== '' ||
    pin.trim() !== '';
  // Why Save can't run yet — shown next to the button instead of failing with a toast.
  const saveBlocker = !phoneNumberId.trim()
    ? 'Phone Number ID is required.'
    : !hasNewToken
      ? config
        ? 'Re-enter the access token to save changes.'
        : 'Access token is required.'
      : null;
  const showSave = !config || showManual || isDirty;
  const inputCls = 'bg-muted border-border text-foreground placeholder:text-muted-foreground';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        icon={PlugZap}
        title="WhatsApp connection"
        description="Connect your Meta WhatsApp Business API. Credentials, webhook, and setup steps all live here."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {/* Status hero — one place for "am I live?" */}
        <div className={'rounded-3xl border p-5 shadow-sm transition-colors ' + heroTone}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <IconChip
                icon={isLive ? ShieldCheck : Phone}
                tone={isLive ? 'solid' : 'muted'}
                className="size-14 rounded-2xl"
              />
              <div className="min-w-0">
                <span
                  className={
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ' +
                    (isLive
                      ? 'bg-primary text-primary-foreground'
                      : config
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground')
                  }
                >
                  <span className={'size-1.5 rounded-full bg-current ' + (isLive ? 'animate-pulse' : '')} />
                  {isLive ? 'Live' : config ? 'Needs attention' : 'Not connected'}
                </span>
                {phoneInfo?.display_phone_number ? (
                  <>
                    <p className="mt-1.5 truncate text-2xl font-bold tracking-tight text-foreground">
                      {phoneInfo.display_phone_number}
                    </p>
                    {phoneInfo.verified_name && (
                      <p className="truncate text-sm text-muted-foreground">{phoneInfo.verified_name}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                    {connectionStatus === 'connected'
                      ? 'Credentials work, but Meta hasn’t confirmed a phone number yet. Click Verify with Meta.'
                      : statusMessage || 'Use Quick connect below, or enter your Meta API credentials manually.'}
                  </p>
                )}
              </div>
            </div>
            {config && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing} className="border-border">
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  Test API
                </Button>
                <Button variant="outline" size="sm" onClick={handleVerifyRegistration} disabled={verifyingRegistration} className="border-border">
                  {verifyingRegistration ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  Verify with Meta
                </Button>
              </div>
            )}
          </div>

          {/* Account details */}
          {config && (
            <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-2xl border border-border bg-card/60 p-4 text-sm sm:grid-cols-2">
              {details.map((d) => (
                <div key={d.label} className="min-w-0">
                  <dt className="text-xs font-semibold text-muted-foreground">{d.label}</dt>
                  <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                    {d.tone && (
                      <span
                        className={
                          'size-2 shrink-0 rounded-full ' +
                          (d.tone === 'good' ? 'bg-emerald-500' : d.tone === 'warn' ? 'bg-amber-500' : 'bg-red-500')
                        }
                      />
                    )}
                    <span className={'truncate ' + (d.mono ? 'font-mono text-xs' : '')}>{d.value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {/* Progress */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Setup progress</span>
              <span>{doneCount} of {steps.length}</span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
            <ol className="grid gap-2 sm:grid-cols-4">
              {steps.map((step, i) => (
                <li
                  key={step.label}
                  className={
                    'flex items-center gap-2.5 rounded-2xl border p-2.5 transition-colors ' +
                    (step.done ? 'border-primary-soft-2 bg-primary-soft' : 'border-border bg-card-2')
                  }
                >
                  <span
                    className={
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
                      (step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                    }
                  >
                    {step.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={'text-xs font-semibold leading-tight ' + (step.done ? 'text-foreground' : 'text-muted-foreground')}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Registration detail / PIN prompt */}
          {config && (
            <div className="mt-4 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground">
              {isRegistered ? (
                <p>
                  Registered since{' '}
                  {config.registered_at ? new Date(config.registered_at).toLocaleString() : 'unknown'}. Click{' '}
                  <strong className="text-foreground">Verify with Meta</strong> if events stop arriving.
                </p>
              ) : (
                <>
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      <strong className="text-foreground">Not registered — Meta will not deliver events.</strong>{' '}
                      {lastRegistrationError ? (
                        <>
                          Last attempt failed:{' '}
                          <span className="text-red-600 dark:text-red-300">&quot;{lastRegistrationError}&quot;</span>.
                          Enter the correct 2-step PIN to retry.
                        </>
                      ) : (
                        <>Enter your 2-step verification PIN to subscribe this number.</>
                      )}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">2-step verification PIN</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit PIN"
                        value={registerPin}
                        onChange={(e) => setRegisterPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className={inputCls + ' h-8 w-36 tracking-widest'}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRegisterWithPin}
                      disabled={registeringPin || registerPin.length !== 6}
                      className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {registeringPin ? <Loader2 className="size-3.5 animate-spin" /> : 'Register'}
                    </Button>
                  </div>
                </>
              )}

              {registrationProbe && (
                <div className="mt-3 space-y-1.5 rounded-2xl border border-border bg-card/60 px-3 py-2.5 text-[11px]">
                  <p className="font-medium text-foreground">
                    Diagnostic — last run:{' '}
                    <span className={registrationProbe.live ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                      {registrationProbe.live ? 'live' : 'not live'}
                    </span>
                  </p>
                  <ul className="space-y-0.5">
                    {Object.entries(registrationProbe.checks).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-1.5">
                        {v === true ? (
                          <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : v === false ? (
                          <XCircle className="size-3 shrink-0 text-red-400" />
                        ) : (
                          <span className="size-3 shrink-0 rounded-full border border-border" />
                        )}
                        <code>{k}</code>
                      </li>
                    ))}
                  </ul>
                  {(registrationProbe.errors ?? []).length > 0 && (
                    <ul className="space-y-0.5 pt-1 text-red-600 dark:text-red-300">
                      {registrationProbe.errors?.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  )}
                  {registrationProbe.coexistence?.is_on_biz_app && (
                    <div className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
                      <p className="font-medium text-foreground">WhatsApp Business app sync (coexistence)</p>
                      <p>
                        Contacts:{' '}
                        {registrationProbe.coexistence.contacts_synced_at
                          ? `synced ${new Date(registrationProbe.coexistence.contacts_synced_at).toLocaleString()}`
                          : 'not synced yet'}
                      </p>
                      <p>
                        History:{' '}
                        {registrationProbe.coexistence.history_synced_at
                          ? `synced ${new Date(registrationProbe.coexistence.history_synced_at).toLocaleString()}`
                          : 'not synced yet'}
                      </p>
                      {registrationProbe.coexistence.sync_error && (
                        <p className="text-red-600 dark:text-red-300">• Sync error: {registrationProbe.coexistence.sync_error}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Corrupted-token reset banner */}
        {showResetBanner && (
          <Alert className="rounded-3xl border-amber-500/40 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <AlertTitle className="mb-1 text-amber-700 dark:text-amber-200">Stored token can&apos;t be decrypted</AlertTitle>
                <AlertDescription className="text-sm text-amber-800/90 dark:text-amber-100/80">{statusMessage}</AlertDescription>
                <Button onClick={handleReset} disabled={resetting} size="sm" className="mt-3 bg-amber-600 text-white hover:bg-amber-700">
                  {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  {resetting ? 'Resetting...' : 'Reset Configuration'}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {justConnected && (
          <Alert className="rounded-3xl border-emerald-500/40 bg-emerald-500/10">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <AlertTitle className="mb-1 text-emerald-700 dark:text-emerald-200">
                  {isRegistered ? "WhatsApp connected — you're live!" : 'WhatsApp connected — one step left'}
                </AlertTitle>
                <AlertDescription className="text-sm text-emerald-800/80 dark:text-emerald-100/80">
                  {isRegistered
                    ? 'Your number is registered and Meta will deliver incoming messages to your inbox.'
                    : 'Your phone number is saved. Enter the 6-digit 2-step verification PIN in the status card above — until then Meta will NOT deliver incoming messages.'}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Quick connect */}
        <Card className={config ? '' : 'border-primary-soft-2 bg-primary-soft/40'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
              <IconChip icon={Zap} className="size-10 rounded-2xl" />
              <span className="flex flex-wrap items-center gap-2">
                Quick connect
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Recommended</span>
              </span>
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Sign in with Facebook and pick your WhatsApp Business Account — no copying credentials by hand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmbeddedSignupButton
              onConnected={() => {
                setJustConnected(true);
                if (accountId) fetchConfig(accountId);
              }}
            />
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
              <IconChip icon={Webhook} className="size-10 rounded-2xl" />
              Webhook
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Paste these into WhatsApp &gt; Configuration in the Meta App Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Callback URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="border-border bg-muted font-mono text-sm text-muted-foreground" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy('webhook', webhookUrl)}
                  aria-label="Copy webhook URL"
                  className="shrink-0 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied === 'webhook' ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                </Button>
              </div>
              {webhookUrl.includes('localhost') && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Meta can&apos;t reach localhost — use a public HTTPS URL (e.g. ngrok) when testing.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-verify" className="text-muted-foreground">Verify token</Label>
              <div className="flex gap-2">
                <Input
                  id="wa-verify"
                  placeholder={config ? 'Leave blank to keep the current token' : 'Create a custom verify token'}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className={inputCls}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy('verify', verifyToken)}
                  disabled={!verifyToken}
                  aria-label="Copy verify token"
                  className="shrink-0 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied === 'verify' ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A string you make up. It must match the token you enter in Meta&apos;s webhook settings.</p>
            </div>
          </CardContent>
        </Card>

        {/* Manual credentials — collapsible once connected */}
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              aria-expanded={showManual || !config}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-3">
                <IconChip icon={KeyRound} className="size-10 rounded-2xl" />
                <span>
                  <span className="block text-base font-bold tracking-tight text-foreground">Manual credentials</span>
                  <span className="block text-sm text-muted-foreground">
                    {config ? 'Update your Meta API credentials or rotate the token.' : 'Enter your Meta WhatsApp Business API credentials.'}
                  </span>
                </span>
              </span>
              {config && (
                <ChevronDown className={'size-5 shrink-0 text-muted-foreground transition-transform ' + (showManual ? 'rotate-180' : '')} />
              )}
            </button>
          </CardHeader>
          {(showManual || !config) && (
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wa-phone-id" className="text-muted-foreground">Phone Number ID <span className="text-red-500">*</span></Label>
                  <Input id="wa-phone-id" placeholder="e.g. 100234567890123" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wa-waba" className="text-muted-foreground">WhatsApp Business Account ID</Label>
                  <Input id="wa-waba" placeholder="e.g. 100234567890456" value={wabaId} onChange={(e) => setWabaId(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wa-token" className="text-muted-foreground">Permanent Access Token <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="wa-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Enter your access token"
                    value={accessToken}
                    onChange={(e) => {
                      setAccessToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    onFocus={() => {
                      if (accessToken === MASKED_TOKEN) {
                        setAccessToken('');
                        setTokenEdited(true);
                      }
                    }}
                    className={inputCls + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {config && !tokenEdited && (
                  <p className="text-xs text-muted-foreground">Token is hidden for security. Re-enter it to update configuration.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="wa-pin" className="text-muted-foreground">
                  Two-step verification PIN <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="wa-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit PIN from Meta WhatsApp Manager"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={inputCls + ' tracking-widest'}
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Only needed to receive <strong>inbound</strong> messages on a <strong>production</strong> number. Set it in{' '}
                  <strong>Meta Business Manager → WhatsApp Accounts → Phone Numbers → Two-step verification</strong>. Meta test
                  numbers have no PIN — leave blank. Blank also keeps an existing registration untouched.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Sticky action bar */}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-card/90 p-3 shadow-lg backdrop-blur">
          {showSave ? (
            <>
              <Button
                onClick={handleSave}
                disabled={saving || !isDirty || !!saveBlocker}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
              {isDirty && saveBlocker && (
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {saveBlocker}
                </button>
              )}
              {!isDirty && <span className="text-xs text-muted-foreground">No changes to save</span>}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Configuration saved
            </span>
          )}
          <div className="flex-1" />
          {config &&
            (confirmingReset ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Delete this config?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmingReset(false)} className="border-border">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleReset} disabled={resetting} className="bg-red-600 text-white hover:bg-red-700">
                  {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  Yes, reset
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setConfirmingReset(true)}
                className="border-red-900 text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:text-red-300"
              >
                <RotateCcw className="size-4" />
                Reset
              </Button>
            ))}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground"><IconChip icon={ListChecks} className="size-10 rounded-2xl" />Setup Instructions</CardTitle>
            <CardDescription className="text-muted-foreground">
              Follow these steps to connect your WhatsApp Business API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                    Create a Meta App
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to <span className="text-primary">developers.facebook.com</span></li>
                    <li>Click &quot;My Apps&quot; and then &quot;Create App&quot;</li>
                    <li>Select &quot;Business&quot; as the app type</li>
                    <li>Fill in app details and create</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                    Add WhatsApp Product
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>In your app dashboard, click &quot;Add Product&quot;</li>
                    <li>Find &quot;WhatsApp&quot; and click &quot;Set Up&quot;</li>
                    <li>Follow the setup wizard to link your business</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                    Get API Credentials
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp &gt; API Setup</li>
                    <li>Copy your <strong className="text-foreground">Phone Number ID</strong></li>
                    <li>Copy your <strong className="text-foreground">WhatsApp Business Account ID</strong></li>
                    <li>Generate a <strong className="text-foreground">Permanent Access Token</strong> from Business Settings &gt; System Users</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem className="border-border">
                <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                    Configure Webhooks
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp &gt; Configuration</li>
                    <li>Click &quot;Edit&quot; on the Webhook section</li>
                    <li>Paste the <strong className="text-foreground">Webhook Callback URL</strong> from above</li>
                    <li>Enter the same <strong className="text-foreground">Verify Token</strong> you set here</li>
                    <li>Subscribe to &quot;messages&quot; webhook field</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Meta WhatsApp API Documentation
              </a>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
    </section>
  );
}
