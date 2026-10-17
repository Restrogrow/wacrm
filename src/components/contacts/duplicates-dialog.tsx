'use client';

// "Find duplicates": groups of contacts sharing an email or the same
// phone number (last 10 digits, so +91 and local formats match). Each
// extra contact in a group can be merged into the oldest one.

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import type { Contact } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Group {
  kind: 'phone' | 'email';
  key: string;
  ids: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  canMerge: boolean;
  /** Called with (keep, remove) when the user picks a pair to merge. */
  onMerge: (keepId: string, removeId: string) => void;
  /** Bump to reload the list after a merge. */
  refreshKey: number;
}

export function DuplicatesDialog({ open, onOpenChange, accountId, canMerge, onMerge, refreshKey }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      setLoading(true);
      setFailed(false);
      const { data, error } = await supabase.rpc('find_duplicate_contacts', { p_account_id: accountId });
      if (cancelled) return;
      if (error) {
        setFailed(true);
        setLoading(false);
        return;
      }
      const found = ((data ?? []) as Array<{ kind: 'phone' | 'email'; dup_key: string; contact_ids: string[] }>).map(
        (g) => ({ kind: g.kind, key: g.dup_key, ids: g.contact_ids }),
      );
      const allIds = [...new Set(found.flatMap((g) => g.ids))];
      const byId: Record<string, Contact> = {};
      for (let i = 0; i < allIds.length; i += 200) {
        const { data: rows } = await supabase.from('contacts').select('*').in('id', allIds.slice(i, i + 200));
        (rows as Contact[] | null)?.forEach((c) => (byId[c.id] = c));
      }
      if (cancelled) return;
      setContacts(byId);
      setGroups(found.filter((g) => g.ids.filter((id) => byId[id]).length > 1));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, refreshKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Find duplicates</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Contacts that share an email address or the same phone number. Merge each extra record
            into the oldest one to keep a single conversation history.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : failed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Could not check for duplicates. If you have just updated the app, run migration 068 in
            Supabase and try again.
          </p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="size-8 text-emerald-600" />
            <p className="text-sm font-medium">No duplicates found</p>
            <p className="text-xs text-muted-foreground">Every contact has a unique phone number and email.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const members = g.ids.map((id) => contacts[id]).filter(Boolean);
              const [keep, ...rest] = members;
              return (
                <div key={`${g.kind}:${g.key}`} className="rounded-xl border border-border p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Same {g.kind === 'phone' ? 'phone number' : 'email'}: {g.kind === 'phone' ? `…${g.key}` : g.key}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-1.5 text-sm">
                      <span className="truncate">
                        <span className="font-medium">{keep.name || keep.phone}</span>{' '}
                        <span className="text-muted-foreground">{keep.phone}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">
                        Oldest — keep
                      </span>
                    </div>
                    {rest.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-muted/50">
                        <span className="truncate">
                          <span className="font-medium">{c.name || c.phone}</span>{' '}
                          <span className="text-muted-foreground">{c.phone}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canMerge}
                          onClick={() => onMerge(keep.id, c.id)}
                          className="shrink-0 border-border"
                        >
                          Review &amp; merge
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
