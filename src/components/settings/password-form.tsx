'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, KeyRound } from 'lucide-react';

import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

const MIN_PASSWORD = 8;

/**
 * Does this account sign in with a password? Google sign-ups don't
 * have one until they set it here (recorded as user_metadata.has_password,
 * since Supabase doesn't add an "email" identity for it).
 */
function hasPasswordLogin(user: User | null): boolean {
  if (!user) return true;
  const providers: unknown[] = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [user.app_metadata?.provider];
  return (
    providers.includes('email') ||
    (user.identities ?? []).some((i) => i.provider === 'email') ||
    user.user_metadata?.has_password === true
  );
}

export function PasswordForm() {
  const { profile, user } = useAuth();
  const supabase = createClient();
  const [justSet, setJustSet] = useState(false);
  // Google-only accounts set a first password without a current one.
  const settingFirst = !hasPasswordLogin(user) && !justSet;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.email) {
      toast.error('Cannot change password without a current email');
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setConfirmError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (next !== confirm) {
      setConfirmError('New password and confirmation do not match');
      return;
    }
    setConfirmError(null);
    setSaving(true);

    try {
      if (!settingFirst) {
        // Supabase doesn't expose a "verify password without issuing a
        // session" API, so we re-authenticate with the provided current
        // password. If it matches, the session refreshes silently; if it
        // doesn't, we abort before calling updateUser.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: profile.email,
          password: current,
        });
        if (signInError) {
          toast.error('Current password is incorrect');
          return;
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: next,
        data: { has_password: true },
      });
      if (updateError) {
        toast.error(`Password update failed: ${updateError.message}`);
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      if (settingFirst) {
        setJustSet(true);
        toast.success('Password set — you can now also sign in with your email and password');
      } else {
        toast.success('Password updated');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <KeyRound className="size-4 text-primary" />
          Password
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {settingFirst
            ? `You signed up with Google. Set a password (at least ${MIN_PASSWORD} characters) to also sign in with your email.`
            : `Use at least ${MIN_PASSWORD} characters. You will stay signed in on this device after changing it.`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {!settingFirst && (
            <div className="space-y-2">
              <Label htmlFor="current-password" className="text-foreground">
                Current password
              </Label>
              <Input
                id="current-password"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                disabled={saving}
                required
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-foreground">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                disabled={saving}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-foreground">
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                disabled={saving}
                required
              />
            </div>
          </div>

          {confirmError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {confirmError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || (!settingFirst && !current) || !next || !confirm}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Updating…
                </>
              ) : settingFirst ? (
                'Set password'
              ) : (
                'Update password'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
