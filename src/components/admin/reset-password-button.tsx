'use client';

// Platform admin: set a new password for one member of an account (a
// customer locked out of their email). Saves via
// POST /api/admin/accounts/[id]/members/[userId]/password.

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_PASSWORD = 8;

/** 12 characters without look-alikes (0/O, 1/l/I), easy to read out. */
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function ResetPasswordButton({
  accountId,
  userId,
  email,
}: {
  accountId: string;
  userId: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setPassword(generatePassword());
    setSaved(false);
    setCopied(false);
    setOpen(true);
  }

  async function save() {
    if (password.length < MIN_PASSWORD) {
      toast.error(`Use at least ${MIN_PASSWORD} characters`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/members/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not reset the password');
      setSaved(true);
      toast.success(`Password changed for ${email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      toast.error('Could not copy — select the password and copy it');
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <KeyRound className="size-3.5" />
        Reset password
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new sign-in password for <b>{email}</b>. Their old password stops working.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`pw-${userId}`}>New password</Label>
            <div className="flex gap-2">
              <Input
                id={`pw-${userId}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setSaved(false);
                }}
                disabled={saving || saved}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generatePassword())}
                disabled={saving || saved}
                aria-label="Generate a new password"
                title="Generate"
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy password" title="Copy">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {saved
                ? 'Saved. Send it to the customer privately and ask them to change it in Settings → Profile.'
                : `At least ${MIN_PASSWORD} characters. Copy it before closing — it isn't shown again.`}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {saved ? 'Done' : 'Cancel'}
            </Button>
            {!saved && (
              <Button onClick={save} disabled={saving || password.length < MIN_PASSWORD}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Set password
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
