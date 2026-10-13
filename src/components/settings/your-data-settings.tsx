'use client';

// ============================================================
// YourDataSettings — Settings → Your data
//
// "Download my data" (JSON export) and "Delete my account", for the
// DPDP Act / GDPR. Everyone can use both:
//   * teammates export their own data and delete only their login;
//   * owners and admins also export the business's data;
//   * an owner deleting their account deletes the whole business, so
//     they must remove teammates / transfer ownership first.
// API: /api/account/export, /api/account/delete.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Download, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { SettingsPanelHead } from './settings-panel-head';

interface DeleteInfo {
  is_owner: boolean;
  account_name: string;
  other_members: number;
  can_delete: boolean;
  confirm_with: string | null;
}

export function YourDataSettings() {
  const { canManageMembers } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [info, setInfo] = useState<DeleteInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/delete')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DeleteInfo | null) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? 'Could not prepare your download. Try again in a minute.');
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
        'repeat-grow-data.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Your data has been downloaded.');
    } catch {
      toast.error('Could not prepare your download. Try again in a minute.');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not delete your account.');
        setDeleting(false);
        return;
      }
      await createClient().auth.signOut().catch(() => {});
      // Full page load so no signed-in client state survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/?account_deleted=1';
    } catch {
      toast.error('Could not delete your account.');
      setDeleting(false);
    }
  }

  const confirmMatches =
    !!info?.confirm_with &&
    confirmText.trim().toLowerCase() === info.confirm_with.trim().toLowerCase();

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Your data"
        description="Download a copy of your data or delete your account. These options are here so you stay in control of your information, as India's DPDP Act requires."
      />

      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">Download your data</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManageMembers
                  ? 'A JSON file with your profile and all of your business’s data: contacts, tags, conversations and messages, deals, broadcasts, templates, automations, flows and integration settings.'
                  : 'A JSON file with your profile, sign-in details and notifications. Ask an admin of your business for a copy of the business’s data.'}{' '}
                Passwords, access tokens and secret keys are never included.
              </p>
            </div>
          </div>
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exporting ? 'Preparing…' : 'Download my data'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-500/30 bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">Delete your account</h3>
              {info?.is_owner ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  You own <b className="text-foreground">{info.account_name}</b>. Deleting your account
                  permanently deletes the business and everything in it: contacts, chats and messages,
                  deals, broadcasts, templates, automations, and the WhatsApp, Shopify and Calendly
                  connections. This can&apos;t be undone — download your data first.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Deletes your login and personal details. The business&apos;s contacts and chats stay with
                  the business, and anything you created is kept by its owner.
                </p>
              )}
            </div>
          </div>

          {info && !info.can_delete ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-foreground">
              Your business still has {info.other_members} teammate{info.other_members === 1 ? '' : 's'}.
              Remove them or transfer ownership in{' '}
              <Link href="/settings?tab=members" className="font-medium underline underline-offset-4">
                Team members
              </Link>{' '}
              first.
            </p>
          ) : null}

          <Button
            onClick={() => {
              setConfirmText('');
              setDialogOpen(true);
            }}
            disabled={!info || !info.can_delete}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <Trash2 className="size-4" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !deleting && setDialogOpen(open)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-red-500" />
              {info?.is_owner ? 'Delete your account and business?' : 'Delete your account?'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {info?.is_owner
                ? `This permanently deletes ${info.account_name} and all of its data. It can't be undone.`
                : "This permanently deletes your login. It can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm" className="text-sm">
              Type <b>{info?.confirm_with}</b> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder={info?.confirm_with ?? ''}
            />
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={!confirmMatches || deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
