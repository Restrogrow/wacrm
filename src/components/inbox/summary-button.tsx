'use client';

// Sparkles icon in the chat header: an AI summary of the conversation so
// an agent can catch up (or take over) in seconds.
// API: POST /api/inbox/conversations/[id]/summary.

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/lib/ai/languages';

const MOOD_LABEL: Record<ConversationSummary['mood'], { text: string; className: string }> = {
  happy: { text: 'Happy', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  neutral: { text: 'Neutral', className: 'bg-muted text-muted-foreground' },
  unhappy: { text: 'Unhappy', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

export function SummaryButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [count, setCount] = useState(0);
  const [forId, setForId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/summary`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Could not summarise this chat.');
        return;
      }
      setSummary(body.summary as ConversationSummary);
      setCount(Number(body.message_count) || 0);
      setForId(conversationId);
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOpen(true);
    // Reuse the last summary for this chat; a new chat gets a fresh one.
    if (forId !== conversationId || !summary) {
      setSummary(null);
      void load();
    }
  }

  async function copy() {
    if (!summary) return;
    const text = [
      `Summary: ${summary.summary}`,
      summary.customer_wants && `Customer wants: ${summary.customer_wants}`,
      ...summary.key_points.map((p) => `- ${p}`),
      summary.next_step && `Next step: ${summary.next_step}`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Summarise this chat with AI"
        title="Summarise this chat (AI)"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Chat summary
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Written by AI from the latest messages. Check important details in the chat.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Reading the chat…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{error}</p>
          ) : summary ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('rounded-full px-2 py-0.5 font-medium', MOOD_LABEL[summary.mood].className)}>
                  {MOOD_LABEL[summary.mood].text}
                </span>
                {summary.customer_language && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    Writes in {summary.customer_language}
                  </span>
                )}
                <span className="text-muted-foreground">{count} messages read</span>
              </div>
              <p className="leading-relaxed text-foreground">{summary.summary}</p>
              {summary.customer_wants && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer wants</p>
                  <p className="mt-1 text-foreground">{summary.customer_wants}</p>
                </div>
              )}
              {summary.key_points.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key points</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                    {summary.key_points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.next_step && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Suggested next step</p>
                  <p className="mt-1 text-foreground">{summary.next_step}</p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button onClick={() => void copy()} disabled={!summary || loading}>
              <Copy className="size-4" />
              Copy summary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
