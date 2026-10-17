'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Factor {
  id: string;
  friendly_name?: string | null;
  created_at?: string;
}

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

/** Tell the server something changed so the activity log records it (it re-checks the truth). */
function logSecurityEvent(event: '2fa_enabled' | '2fa_disabled') {
  void fetch('/api/account/security-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}

/**
 * Two-factor login (authenticator app / TOTP) via Supabase Auth MFA.
 * Turning it on asks for a 6-digit code at every sign-in. Works for
 * password and Google accounts alike.
 */
export function TwoFactorCard() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error('Could not load two-factor settings');
    } else {
      // `totp` only lists verified factors.
      setFactors((data?.totp ?? []) as Factor[]);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEnroll() {
    setBusy(true);
    // Clear out any half-finished attempt first so enrolling can be retried.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? 'Could not start setup');
      return;
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (cErr || !challenge) {
      setBusy(false);
      toast.error(cErr?.message ?? 'Could not verify');
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error("That code didn't match. Check your app and try again.");
      setCode('');
      return;
    }
    toast.success('Two-factor login is on');
    setEnrollment(null);
    logSecurityEvent('2fa_enabled');
    await load();
  }

  async function cancelEnroll() {
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCode('');
  }

  async function remove(factorId: string) {
    if (!window.confirm('Turn off two-factor login for your account?')) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Two-factor login is off');
    logSecurityEvent('2fa_disabled');
    await load();
  }

  const enabled = factors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enabled ? <ShieldCheck className="size-5 text-emerald-600" /> : <ShieldOff className="text-muted-foreground size-5" />}
          Two-factor login
          {!loading && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
              }`}
            >
              {enabled ? 'On' : 'Off'}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Ask for a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) every time you sign
          in, so a stolen password alone can&apos;t get into your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" />
        ) : enrollment ? (
          <form onSubmit={confirmEnroll} className="space-y-4">
            <p className="text-sm">
              1. Scan this QR code with your authenticator app.
              <br />
              2. Enter the 6-digit code it shows to finish.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qr} alt="Scan with your authenticator app" className="size-44 rounded-lg border bg-white p-2" />
            <p className="text-muted-foreground text-xs">
              Can&apos;t scan? Enter this key manually:{' '}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px] break-all">{enrollment.secret}</code>
            </p>
            <div className="max-w-[220px] space-y-2">
              <Label htmlFor="totp-code">6-digit code</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Turn on'}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEnroll} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : enabled ? (
          <div className="space-y-3">
            {factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                <div>
                  <p className="font-medium">{f.friendly_name || 'Authenticator app'}</p>
                  {f.created_at && (
                    <p className="text-muted-foreground text-xs">Added {new Date(f.created_at).toLocaleDateString('en-IN')}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => remove(f.id)}>
                  Turn off
                </Button>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              Keep your authenticator app safe. If you lose it, contact support@repeatgrow.com to recover your account.
            </p>
          </div>
        ) : (
          <Button onClick={startEnroll} disabled={busy}>
            {busy ? 'Starting…' : 'Set up two-factor login'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
