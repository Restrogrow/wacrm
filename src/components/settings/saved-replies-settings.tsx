'use client';

// ============================================================
// SavedRepliesSettings — Settings → Saved replies
//
// Quick replies the whole team inserts in the inbox by typing "/".
// Everyone can see them; admins and above add, edit and delete
// (RLS in migration 042 enforces the same).
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  REPLY_VARIABLES,
  SHORTCUT_RE,
  normalizeShortcut,
  type SavedReply,
} from '@/lib/saved-replies';
import { SettingsPanelHead } from './settings-panel-head';

interface Draft {
  id: string | null;
  shortcut: string;
  title: string;
  body: string;
}

const EMPTY: Draft = { id: null, shortcut: '', title: '', body: '' };

export function SavedRepliesSettings() {
  const { accountId, user, canEditSettings } = useAuth();
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const fetchReplies = useCallback(async () => {
    const { data, error } = await createClient()
      .from('saved_replies')
      .select('id, shortcut, title, body')
      .order('shortcut');
    return {
      replies: (data ?? []) as SavedReply[],
      missing: !!error && /saved_replies/.test(error.message),
    };
  }, []);

  const load = useCallback(async () => {
    const result = await fetchReplies();
    setReplies(result.replies);
    setMissing(result.missing);
  }, [fetchReplies]);

  useEffect(() => {
    let cancelled = false;
    void fetchReplies().then((result) => {
      if (cancelled) return;
      setReplies(result.replies);
      setMissing(result.missing);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchReplies]);

  function insertVariable(token: string) {
    if (!draft) return;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!draft || !accountId) return;
    const shortcut = normalizeShortcut(draft.shortcut);
    if (!SHORTCUT_RE.test(shortcut)) {
      toast.error('Shortcut: use letters, numbers, - or _ (e.g. price)');
      return;
    }
    if (!draft.body.trim()) {
      toast.error('Write the reply message');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const row = {
        shortcut,
        title: draft.title.trim() || null,
        body: draft.body.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error } = draft.id
        ? await supabase.from('saved_replies').update(row).eq('id', draft.id)
        : await supabase
            .from('saved_replies')
            .insert({
              ...row,
              account_id: accountId,
              created_by: user?.id ?? null,
            });
      if (error) {
        toast.error(
          error.code === '23505'
            ? `"/${shortcut}" already exists — pick another shortcut`
            : 'Could not save the reply'
        );
        return;
      }
      toast.success(draft.id ? 'Reply updated' : 'Reply added');
      setDraft(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(reply: SavedReply) {
    const { error } = await createClient()
      .from('saved_replies')
      .delete()
      .eq('id', reply.id);
    if (error) {
      toast.error('Could not delete the reply');
      return;
    }
    toast.success(`Deleted /${reply.shortcut}`);
    setReplies((prev) => prev.filter((r) => r.id !== reply.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  if (missing) {
    return (
      <section className="space-y-6">
        <SettingsPanelHead icon={MessageSquareText} title="Saved replies" />
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Saved replies aren&apos;t set up yet. Run
            supabase/migrations/042_saved_replies.sql in the Supabase SQL
            Editor.
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={MessageSquareText}
        title="Saved replies"
        description='Answers your team sends often. In the inbox, type "/" and pick one — or type its shortcut, like /price.'
        action={
          canEditSettings && !draft ? (
            <Button onClick={() => setDraft(EMPTY)}>
              <Plus className="size-4" />
              New reply
            </Button>
          ) : null
        }
      />

      {draft && (
        <Card className="ring-2 ring-primary/30">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
                <Pencil className="size-5" />
              </span>
              <h3 className="text-base font-bold tracking-tight text-foreground">{draft.id ? 'Edit reply' : 'New reply'}</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label
                  htmlFor="reply-shortcut"
                  className="text-muted-foreground text-xs"
                >
                  Shortcut
                </Label>
                <div className="relative">
                  <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm">
                    /
                  </span>
                  <Input
                    id="reply-shortcut"
                    value={draft.shortcut}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        shortcut: normalizeShortcut(e.target.value),
                      })
                    }
                    placeholder="price"
                    className="pl-6 font-mono"
                    maxLength={32}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="reply-title"
                  className="text-muted-foreground text-xs"
                >
                  Title (optional)
                </Label>
                <Input
                  id="reply-title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="Price list"
                  maxLength={80}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="reply-body"
                className="text-muted-foreground text-xs"
              >
                Message
              </Label>
              <Textarea
                id="reply-body"
                ref={bodyRef}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Hi {{name}}, our plans start at ₹999/month. Want me to send the details?"
                rows={4}
                maxLength={4096}
              />
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Insert:</span>
                {REPLY_VARIABLES.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => insertVariable(v.token)}
                    className="border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl border px-2 py-0.5 font-mono text-[11px]"
                    title={v.label}
                  >
                    {v.token}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDraft(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {draft.id ? 'Save changes' : 'Add reply'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {replies.length === 0 ? (
        <Card className="border border-dashed border-primary-soft-2 bg-primary-soft/40 ring-0">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-3xl bg-primary-soft text-primary">
              <MessageSquareText className="size-7" />
            </span>
            <p className="mt-3 text-base font-bold text-foreground">
              No saved replies yet
            </p>
            {canEditSettings && (
              <p className="text-muted-foreground mt-1 text-xs">
                Add your most common answers — prices, timings, address, payment
                details.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {replies.map((reply) => (
            <Card key={reply.id} className="group transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 font-mono text-sm font-bold text-primary">
                      /{reply.shortcut}
                    </span>
                    {reply.title && (
                      <p className="mt-2 truncate text-base font-bold tracking-tight text-foreground">{reply.title}</p>
                    )}
                  </div>
                  {canEditSettings && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit /${reply.shortcut}`}
                        onClick={() =>
                          setDraft({
                            id: reply.id,
                            shortcut: reply.shortcut,
                            title: reply.title ?? '',
                            body: reply.body,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete /${reply.shortcut}`}
                        onClick={() => void remove(reply)}
                      >
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="line-clamp-4 flex-1 rounded-2xl rounded-tl-sm bg-primary-soft/50 px-3.5 py-2.5 text-sm whitespace-pre-wrap text-foreground">
                  {reply.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
