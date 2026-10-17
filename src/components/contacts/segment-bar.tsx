'use client';

// Segments strip for the Contacts page: saved smart lists as pills with
// live counts, a builder to create/edit them, the duplicate finder and
// the two-contact merge. The page owns the list query; this component
// tells it which segment is active.

import { useCallback, useEffect, useState } from 'react';
import { CopyCheck, GitMerge, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { loadSegments, type SegmentRow } from '@/lib/segments/resolve';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { DuplicatesDialog } from './duplicates-dialog';
import { MergeContactsDialog } from './merge-contacts-dialog';
import { SegmentBuilderDialog } from './segment-builder-dialog';

interface Props {
  active: SegmentRow | null;
  onSelect: (segment: SegmentRow | null) => void;
  /** Contacts ticked in the table (merge needs exactly two). */
  selectedIds: string[];
  /** Called after a merge or segment change so the list reloads. */
  onContactsChanged: () => void;
  canEdit: boolean;
}

export function SegmentBar({ active, onSelect, selectedIds, onContactsChanged, canEdit }: Props) {
  const { accountId } = useAuth();
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [dupesOpen, setDupesOpen] = useState(false);
  const [dupesKey, setDupesKey] = useState(0);
  const [mergeIds, setMergeIds] = useState<[string, string] | null>(null);

  const reload = useCallback(async (): Promise<SegmentRow[]> => {
    if (!accountId) return [];
    try {
      const rows = await loadSegments(createClient(), accountId);
      setSegments(rows);
      setUnavailable(false);
      return rows;
    } catch {
      // Migration 068 not applied yet: hide the strip's list but keep
      // the rest of the Contacts page working.
      setUnavailable(true);
      return [];
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  async function afterSave(savedId: string) {
    const rows = await reload();
    const saved = rows.find((r) => r.id === savedId) ?? null;
    onSelect(saved);
    onContactsChanged();
  }

  async function handleDelete() {
    if (!active) return;
    setDeleting(true);
    const { error } = await createClient().from('segments').delete().eq('id', active.id);
    setDeleting(false);
    setDeleteOpen(false);
    if (error) {
      toast.error('Could not delete the segment.');
      return;
    }
    toast.success('Segment deleted');
    onSelect(null);
    await reload();
    onContactsChanged();
  }

  function handleMerged() {
    setMergeIds(null);
    setDupesKey((k) => k + 1);
    void reload();
    onContactsChanged();
  }

  const pill = (isActive: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      isActive
        ? 'border-primary/40 bg-primary/10 text-primary'
        : 'border-border bg-card text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Layers className="size-3.5" /> Segments
        </span>

        <button type="button" onClick={() => onSelect(null)} className={pill(active === null)}>
          All contacts
        </button>

        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(active?.id === s.id ? null : s)}
            className={pill(active?.id === s.id)}
          >
            {s.name}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{s.contact_count}</span>
          </button>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit || unavailable}
          onClick={() => {
            setEditing(null);
            setBuilderOpen(true);
          }}
          className="h-7 rounded-full border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-3.5" />
          New segment
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.length === 2 && (
            <Button
              type="button"
              size="sm"
              disabled={!canEdit}
              onClick={() => setMergeIds([selectedIds[0], selectedIds[1]])}
              className="h-7 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
            >
              <GitMerge className="size-3.5" />
              Merge 2 selected
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={unavailable}
            onClick={() => setDupesOpen(true)}
            className="h-7 border-border px-3 text-xs text-muted-foreground hover:bg-muted"
          >
            <CopyCheck className="size-3.5" />
            Find duplicates
          </Button>
        </div>
      </div>

      {active && canEdit && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing the <span className="font-medium text-foreground">{active.name}</span> segment.
          </span>
          <button
            type="button"
            onClick={() => {
              setEditing(active);
              setBuilderOpen(true);
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Pencil className="size-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1 hover:text-red-600"
          >
            <Trash2 className="size-3" /> Delete
          </button>
        </div>
      )}

      <SegmentBuilderDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        segment={editing}
        onSaved={afterSave}
      />

      <DuplicatesDialog
        open={dupesOpen}
        onOpenChange={setDupesOpen}
        accountId={accountId}
        canMerge={canEdit}
        refreshKey={dupesKey}
        onMerge={(keepId, removeId) => setMergeIds([keepId, removeId])}
      />

      <MergeContactsDialog
        open={mergeIds !== null}
        onOpenChange={(o) => {
          if (!o) setMergeIds(null);
        }}
        ids={mergeIds}
        onMerged={handleMerged}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Delete segment</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Delete <span className="font-medium text-popover-foreground">{active?.name}</span>? Your
              contacts are not affected, but broadcasts that use this segment will need a new audience.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
