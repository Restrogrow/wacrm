'use client';

// Platform admin: open a customer's account with their own session, to
// reproduce or fix what they are seeing. Confirms first — this replaces
// the admin's session with the customer's, so it is not a side-by-side
// "preview" and the admin has to sign back in afterwards.

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LoginAsButton({
  accountId,
  accountName,
  compact = false,
}: {
  accountId: string;
  accountName: string;
  /** Icon-only button, for the accounts list. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts/${accountId}/login-as`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not open this account');
      // Full page load, not router.push: the sb-* cookies now belong to
      // a different user, so every cached client query and the auth
      // context in memory are the admin's and must be thrown away.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open this account');
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={`Log in as ${accountName}`}
          title="Log in as this customer"
          className="size-7 shrink-0"
        >
          <LogIn className="size-3.5" />
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <LogIn className="size-3.5" />
          Log in as customer
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log in as {accountName}?</DialogTitle>
            <DialogDescription>
              You will be signed in as this customer with <b>full access</b> — every change you
              make is a real change to their data, and messages you send go to their customers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Your own admin session is replaced. A banner stays on screen the whole time, and you
              can leave with <b>Exit customer account</b> and sign back in as yourself.
            </p>
            <p>This is recorded in the audit log.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={go} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Log in as customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
