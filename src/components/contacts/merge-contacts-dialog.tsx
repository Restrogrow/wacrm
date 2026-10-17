'use client';

// Merge two contacts into one: pick the contact to keep, resolve any
// conflicting details, review what moves, confirm. The merge itself is
// one database transaction (merge_contacts, migration 068).

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import {
  MERGE_FIELDS,
  defaultChoices,
  fieldConflicts,
  previewMerge,
  type MergeChoices,
  type MergeField,
  type MergeSide,
} from '@/lib/contacts/merge';
import type { Contact } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Counts {
  conversations: number;
  deals: number;
  notes: number;
  tags: number;
  orders: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exactly two contact ids. The older contact is kept by default. */
  ids: [string, string] | null;
  onMerged: () => void;
}

function label(c: Contact): string {
  return c.name?.trim() || c.phone || c.email || 'Unnamed contact';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function MergeContactsDialog({ open, onOpenChange, ids, onMerged }: Props) {
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [choices, setChoices] = useState<MergeChoices>(defaultChoices());
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  const key = ids ? ids.join(',') : '';

  useEffect(() => {
    if (!open || !ids) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      setLoading(true);
      const [{ data: rows, error }, { data: stats }] = await Promise.all([
        supabase.from('contacts').select('*').in('id', ids),
        supabase.rpc('contact_merge_preview', { p_a: ids[0], p_b: ids[1] }),
      ]);
      if (cancelled) return;
      if (error || !rows || rows.length !== 2) {
        toast.error('Could not load those contacts.');
        onOpenChange(false);
        setLoading(false);
        return;
      }
      const byId: Record<string, Contact> = {};
      (rows as Contact[]).forEach((c) => (byId[c.id] = c));
      const countMap: Record<string, Counts> = {};
      ((stats ?? []) as Array<Record<string, unknown>>).forEach((r) => {
        countMap[r.contact_id as string] = {
          conversations: Number(r.conversations ?? 0),
          deals: Number(r.deals ?? 0),
          notes: Number(r.notes ?? 0),
          tags: Number(r.tags ?? 0),
          orders: Number(r.orders ?? 0),
        };
      });
      const [a, b] = rows as Contact[];
      setContacts(byId);
      setCounts(countMap);
      setPrimaryId(a.created_at <= b.created_at ? a.id : b.id);
      setChoices(defaultChoices());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const primary = primaryId ? contacts[primaryId] : undefined;
  const secondary = ids && primaryId ? contacts[ids[0] === primaryId ? ids[1] : ids[0]] : undefined;

  const conflicts = useMemo(
    () => (primary && secondary ? fieldConflicts(primary, secondary) : []),
    [primary, secondary],
  );
  const merged = useMemo(
    () => (primary && secondary ? previewMerge(primary, secondary, choices) : null),
    [primary, secondary, choices],
  );

  function swap() {
    if (!ids || !primaryId) return;
    setPrimaryId(ids[0] === primaryId ? ids[1] : ids[0]);
    setChoices(defaultChoices());
  }

  async function handleMerge() {
    if (!primary || !secondary) return;
    setMerging(true);
    const { error } = await createClient().rpc('merge_contacts', {
      p_primary: primary.id,
      p_secondary: secondary.id,
      p_choices: choices,
    });
    setMerging(false);
    if (error) {
      toast.error(error.code === 'P0002' ? 'One of those contacts no longer exists.' : 'Could not merge the contacts.');
      return;
    }
    toast.success(`Merged into ${label(primary)}`);
    onOpenChange(false);
    onMerged();
  }

  const moving = secondary ? counts[secondary.id] : undefined;
  const movingText = moving
    ? [
        moving.conversations && plural(moving.conversations, 'conversation'),
        moving.deals && plural(moving.deals, 'deal'),
        moving.notes && plural(moving.notes, 'note'),
        moving.orders && plural(moving.orders, 'order'),
        moving.tags && plural(moving.tags, 'tag'),
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">Merge contacts</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Combine two records for the same person. Conversations, deals, notes, tags and orders
            all move to the contact you keep.
          </DialogDescription>
        </DialogHeader>

        {loading || !primary || !secondary || !merged ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Keep</p>
                <p className="mt-1 truncate text-sm font-medium">{label(primary)}</p>
                <p className="truncate text-xs text-muted-foreground">{primary.phone || primary.email}</p>
              </div>
              <button
                type="button"
                onClick={swap}
                className="self-center rounded-full border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Keep the other contact instead"
                title="Keep the other contact instead"
              >
                <ArrowLeftRight className="size-4" />
              </button>
              <div className="rounded-xl border border-border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Merge in &amp; remove
                </p>
                <p className="mt-1 truncate text-sm font-medium">{label(secondary)}</p>
                <p className="truncate text-xs text-muted-foreground">{secondary.phone || secondary.email}</p>
              </div>
            </div>

            {conflicts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">These details differ — pick which to keep:</p>
                {conflicts.map((field: MergeField) => {
                  const def = MERGE_FIELDS.find((f) => f.key === field)!;
                  return (
                    <div key={field} className="rounded-xl border border-border p-3">
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{def.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['primary', 'secondary'] as MergeSide[]).map((side) => {
                          const value = (side === 'primary' ? primary : secondary)[field];
                          const selected = (choices[field] ?? 'primary') === side;
                          return (
                            <label
                              key={side}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                                selected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`merge-${field}`}
                                checked={selected}
                                onChange={() => setChoices((c) => ({ ...c, [field]: side }))}
                              />
                              <span className="truncate">{value}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <p className="font-medium">Result</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="truncate">{merged.name || '—'}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="truncate">{merged.phone || '—'}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{merged.email || '—'}</dd>
                <dt className="text-muted-foreground">Company</dt>
                <dd className="truncate">{merged.company || '—'}</dd>
              </dl>
              {merged.opted_out_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  One of these contacts replied STOP, so the merged contact stays opted out of broadcasts.
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {movingText
                ? `Moving over from ${label(secondary)}: ${movingText}.`
                : `${label(secondary)} has no conversations, deals or notes to move.`}
            </p>

            <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span>
                This can&apos;t be undone. {label(secondary)} will be deleted after everything is
                moved, and a note is added to {label(primary)} recording the merge.
              </span>
            </p>
          </div>
        )}

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={merging || loading || !primary || !secondary}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {merging && <Loader2 className="size-4 animate-spin" />}
            Merge contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
