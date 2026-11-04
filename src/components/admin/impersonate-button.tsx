'use client';

// Platform admin: sign in as one member of an account, to reproduce a
// customer's issue from inside their account. Goes through
// POST /api/admin/accounts/[id]/members/[userId]/impersonate.
//
// A dialog rather than window.confirm — this hands you a live session
// on someone else's business, where anything you send goes out on their
// WhatsApp number under their name, so it's worth a sentence of warning
// and a deliberate second click.

import { useState } from 'react';
import { toast } from 'sonner';
import { LogIn, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ImpersonateButton({
  accountId,
  userId,
  email,
  name,
}: {
  accountId: string;
  userId: string;
  email: string;
  name: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/accounts/${accountId}/members/${userId}/impersonate`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not sign in as this user');

      // A full page assignment, not router.push: the response rewrote
      // the sb-* session cookies, so every cached RSC payload and all
      // client-side auth state in this tab belongs to the admin and has
      // to be thrown away.
      window.location.href = json.redirectTo ?? '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign in as this user');
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LogIn className="size-3.5" />
        Log in as
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in as {name || email}?</DialogTitle>
            <DialogDescription>
              You will be signed out of your admin session and will see the
              app exactly as <b>{email}</b> does. Anything you send goes out
              on their WhatsApp number, under their name. Use &ldquo;Stop
              impersonating&rdquo; in the banner to come back.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={go} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Sign in as them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
