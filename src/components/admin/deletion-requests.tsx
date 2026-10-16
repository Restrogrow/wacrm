'use client';

// Account deletion requests on /admin — approve (deletes the user and,
// for an owner, the whole business) or reject with a note that's
// emailed to them. API: /api/admin/deletion-requests/[id].

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DeletionRequestsData, DeletionRequestRow } from '@/lib/admin/deletion-requests';

function formatIst(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

const STATUS_STYLE: Record<DeletionRequestRow['status'], string> = {
  pending: 'text-amber-600 dark:text-amber-400',
  approved: 'text-red-600 dark:text-red-400',
  rejected: 'text-muted-foreground',
  cancelled: 'text-muted-foreground',
};

export function DeletionRequests({ data }: { data: DeletionRequestsData }) {
  const router = useRouter();
  const [active, setActive] = useState<{ req: DeletionRequestRow; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  if (!data.available) {
    return (
      <p className="border-border text-muted-foreground rounded-2xl border p-4 text-sm">
        Run migration <code>047_account_deletion_requests.sql</code> to receive account deletion requests.
      </p>
    );
  }

  async function decide() {
    if (!active) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deletion-requests/${active.req.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: active.action, note }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Something went wrong.');
        return;
      }
      toast.success(active.action === 'approve' ? 'Account deleted.' : 'Request rejected.');
      setActive(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const confirmWord = 'DELETE';
  const canSubmit = active?.action === 'reject' || typed.trim() === confirmWord;

  return (
    <div className="space-y-3">
      {data.pending.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border p-4 text-sm">No pending requests.</p>
      ) : (
        <div className="border-border divide-border divide-y rounded-2xl border">
          {data.pending.map((req) => (
            <div key={req.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {req.email ?? 'Unknown user'}{' '}
                  <span className="text-muted-foreground font-normal">
                    · {req.is_owner ? 'Owner' : 'Teammate'} of{' '}
                    {req.account_id ? (
                      <Link href={`/admin/accounts/${req.account_id}`} className="underline underline-offset-2">
                        {req.business_name ?? 'account'}
                      </Link>
                    ) : (
                      (req.business_name ?? 'account')
                    )}
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Requested {formatIst(req.requested_at)} IST ·{' '}
                  {req.is_owner
                    ? 'Approving deletes the business and all of its data.'
                    : 'Approving deletes only their login; their data stays with the business.'}
                </p>
                {req.reason ? <p className="mt-2 text-sm">“{req.reason}”</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNote('');
                    setTyped('');
                    setActive({ req, action: 'reject' });
                  }}
                >
                  <X className="size-4" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    setNote('');
                    setTyped('');
                    setActive({ req, action: 'approve' });
                  }}
                >
                  <Check className="size-4" />
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.recent.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer">Recent decisions</summary>
          <ul className="mt-2 space-y-1">
            {data.recent.map((req) => (
              <li key={req.id} className="text-muted-foreground text-xs">
                <span className={`font-medium capitalize ${STATUS_STYLE[req.status]}`}>{req.status}</span> ·{' '}
                {req.email ?? (req.status === 'approved' ? 'deleted user' : 'user')} ·{' '}
                {req.is_owner ? 'owner' : 'teammate'} · {formatIst(req.decided_at ?? req.requested_at)}
                {req.admin_note ? ` · “${req.admin_note}”` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={active !== null} onOpenChange={(open) => !busy && !open && setActive(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className={`size-4 ${active?.action === 'approve' ? 'text-red-500' : 'text-amber-500'}`} />
              {active?.action === 'approve' ? 'Approve and delete?' : 'Reject this request?'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {active?.action === 'approve'
                ? active.req.is_owner
                  ? `This permanently deletes ${active.req.business_name ?? 'the business'} and all of its data, and ${active.req.email ?? 'the owner'}'s login. It can't be undone.`
                  : `This permanently deletes ${active?.req.email ?? 'this user'}'s login. Their data stays with the business.`
                : 'The account is kept. Your note is emailed to them.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={active?.action === 'approve' ? 'Internal note (optional)' : 'Reason, emailed to the user (optional)'}
              rows={3}
            />
            {active?.action === 'approve' && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Type <b>{confirmWord}</b> to confirm
                </p>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
            )}
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setActive(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={decide}
              disabled={!canSubmit || busy}
              className={active?.action === 'approve' ? 'bg-red-600 text-white hover:bg-red-700' : ''}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {active?.action === 'approve' ? 'Delete permanently' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
