'use client';

// Create / edit a saved segment (smart list): a name, "match ALL / ANY",
// and a list of conditions, with a live count of who matches.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  FIELD_DEFS,
  MAX_CONDITIONS,
  emptyRules,
  getFieldDef,
  getOperatorDef,
  newCondition,
  validateRules,
  type SegmentCondition,
  type SegmentFieldKey,
  type SegmentRules,
} from '@/lib/segments/rules';
import { countSegmentMembers, type SegmentRow } from '@/lib/segments/resolve';
import type { CustomField, Tag } from '@/types';
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

const selectCls =
  'h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create a new segment */
  segment: SegmentRow | null;
  onSaved: (segmentId: string) => void;
}

export function SegmentBuilderDialog({ open, onOpenChange, segment, onSaved }: Props) {
  const { accountId, user } = useAuth();
  const [name, setName] = useState('');
  const [rules, setRules] = useState<SegmentRules>(emptyRules());
  const [tags, setTags] = useState<Tag[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(segment?.name ?? '');
    setRules(segment ? structuredClone(segment.rules) : emptyRules());
    setCount(null);
  }, [open, segment]);

  // Tags + custom fields for the pickers.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    void (async () => {
      const [t, f] = await Promise.all([
        supabase.from('tags').select('*').order('name'),
        supabase.from('custom_fields').select('*').order('field_name'),
      ]);
      setTags((t.data ?? []) as Tag[]);
      setFields((f.data ?? []) as CustomField[]);
    })();
  }, [open]);

  const validation = useMemo(() => validateRules(rules), [rules]);

  // Debounced live count of matching contacts.
  useEffect(() => {
    if (!open || !accountId || !validation.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(null);
      return;
    }
    const checked = validation.rules;
    let cancelled = false;
    const handle = setTimeout(async () => {
      setCounting(true);
      try {
        const n = await countSegmentMembers(createClient(), accountId, checked);
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, accountId, validation]);

  function patchCondition(index: number, patch: Partial<SegmentCondition>) {
    setRules((r) => ({
      ...r,
      conditions: r.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function changeField(index: number, field: SegmentFieldKey) {
    setRules((r) => ({
      ...r,
      conditions: r.conditions.map((c, i) => (i === index ? newCondition(field) : c)),
    }));
  }

  function changeOp(index: number, c: SegmentCondition, op: string) {
    const kind = getOperatorDef(c.field, op)?.kind;
    const keep = getOperatorDef(c.field, c.op)?.kind === kind;
    patchCondition(index, {
      op,
      value: keep ? c.value : kind === 'tags' ? [] : kind === 'none' ? undefined : '',
    });
  }

  function addCondition() {
    setRules((r) => ({ ...r, conditions: [...r.conditions, newCondition('name')] }));
  }

  function toggleTag(index: number, c: SegmentCondition, tagId: string) {
    const current = Array.isArray(c.value) ? c.value : [];
    patchCondition(index, {
      value: current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    });
  }

  async function handleSave() {
    if (!accountId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the segment a name.');
      return;
    }
    if (!validation.ok) {
      toast.error(validation.error);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = { name: trimmed, rules: validation.rules, updated_at: new Date().toISOString() };
    const result = segment
      ? await supabase.from('segments').update(payload).eq('id', segment.id).select('id').single()
      : await supabase
          .from('segments')
          .insert({ ...payload, account_id: accountId, created_by: user?.id ?? null })
          .select('id')
          .single();
    setSaving(false);

    if (result.error) {
      toast.error(
        result.error.code === '23505'
          ? 'You already have a segment with that name.'
          : 'Could not save the segment. Please try again.',
      );
      return;
    }
    toast.success(segment ? 'Segment updated' : 'Segment saved');
    onOpenChange(false);
    onSaved(result.data.id as string);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {segment ? 'Edit segment' : 'New segment'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            A segment is a saved list that updates itself as your contacts change. Use it to
            filter your contacts or as a broadcast audience.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="segment-name">
              Name
            </label>
            <Input
              id="segment-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diwali ad leads, last 30 days"
              className="bg-card border-border"
            />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span>Contacts that match</span>
            <select
              value={rules.match}
              onChange={(e) => setRules((r) => ({ ...r, match: e.target.value === 'any' ? 'any' : 'all' }))}
              className={selectCls}
              aria-label="Match all or any condition"
            >
              <option value="all">ALL</option>
              <option value="any">ANY</option>
            </select>
            <span>of these conditions:</span>
          </div>

          <div className="space-y-2">
            {rules.conditions.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No conditions yet — this segment would include every contact.
              </p>
            )}

            {rules.conditions.map((c, i) => {
              const def = getFieldDef(c.field);
              const opDef = getOperatorDef(c.field, c.op);
              return (
                <div key={i} className="rounded-xl border border-border bg-card/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={c.field}
                      onChange={(e) => changeField(i, e.target.value as SegmentFieldKey)}
                      className={selectCls}
                      aria-label="Field"
                    >
                      {FIELD_DEFS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>

                    {c.field === 'custom_field' && (
                      <select
                        value={c.field_id ?? ''}
                        onChange={(e) => patchCondition(i, { field_id: e.target.value })}
                        className={selectCls}
                        aria-label="Custom field"
                      >
                        <option value="">Pick a field…</option>
                        {fields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.field_name}
                          </option>
                        ))}
                      </select>
                    )}

                    <select
                      value={c.op}
                      onChange={(e) => changeOp(i, c, e.target.value)}
                      className={selectCls}
                      aria-label="Condition"
                    >
                      {def?.ops.map((o) => (
                        <option key={o.op} value={o.op}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    {(opDef?.kind === 'text' || opDef?.kind === 'days' || opDef?.kind === 'date') && (
                      <Input
                        value={typeof c.value === 'string' ? c.value : ''}
                        onChange={(e) => patchCondition(i, { value: e.target.value })}
                        type={opDef.kind === 'date' ? 'date' : opDef.kind === 'days' ? 'number' : 'text'}
                        min={opDef.kind === 'days' ? 1 : undefined}
                        maxLength={200}
                        placeholder={opDef.kind === 'days' ? 'Days' : 'Value'}
                        className="h-9 w-44 bg-card border-border"
                        aria-label="Value"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setRules((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }))
                      }
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      aria-label="Remove condition"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {opDef?.kind === 'tags' && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.length === 0 && (
                        <span className="text-xs text-muted-foreground">No tags yet.</span>
                      )}
                      {tags.map((tag) => {
                        const on = Array.isArray(c.value) && c.value.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(i, c, tag.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                              on
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCondition}
              disabled={rules.conditions.length >= MAX_CONDITIONS}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-4" />
              Add condition
            </Button>
          </div>

          <div className="rounded-xl bg-primary-soft px-3 py-2 text-sm">
            {!validation.ok ? (
              <span className="text-muted-foreground">{validation.error}</span>
            ) : counting ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Counting…
              </span>
            ) : count === null ? (
              <span className="text-muted-foreground">Preview unavailable.</span>
            ) : (
              <span>
                <span className="font-semibold">{count}</span> {count === 1 ? 'contact matches' : 'contacts match'} right now.
              </span>
            )}
          </div>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {segment ? 'Save changes' : 'Save segment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
