'use client';

// Voice-note AI under a customer's voice note: one click for the
// transcript, an English translation, a one-line summary and a suggested
// reply the agent can drop into the message box.
// API: POST /api/inbox/messages/[id]/transcribe (cached on the message).

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Languages, Loader2, MessageSquareQuote, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { VoiceNoteAi } from '@/lib/ai/voice-note';

/** The composer listens for this to put text in the message box. */
export const INSERT_REPLY_EVENT = 'rg:insert-reply';

export function VoiceNoteAi({
  messageId,
  initial,
  onPrimary,
}: {
  messageId: string;
  initial?: VoiceNoteAi | null;
  /** True when the bubble has a coloured (agent) background. */
  onPrimary?: boolean;
}) {
  const [voice, setVoice] = useState<VoiceNoteAi | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/messages/${messageId}/transcribe`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Could not transcribe this voice note.');
        return;
      }
      setVoice(body.voice as VoiceNoteAi);
    } catch {
      setError('Network problem. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function useReply() {
    if (!voice?.suggested_reply) return;
    window.dispatchEvent(new CustomEvent(INSERT_REPLY_EVENT, { detail: { text: voice.suggested_reply } }));
    toast.success('Reply added to the message box. Check it, then send.');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  if (!voice) {
    return (
      <div className="mt-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60',
            onPrimary
              ? 'border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10'
              : 'border-border text-foreground hover:bg-background/60',
          )}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {loading ? 'Listening…' : 'Transcribe & translate'}
        </button>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const sameLanguage = voice.english.trim() === voice.transcript.trim();
  return (
    <div className="mt-2 w-full min-w-48 space-y-2 rounded-xl border border-border bg-background/90 p-2.5 text-xs text-foreground">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="size-3 text-primary" />
        Voice note
        {voice.language && <span className="rounded-full bg-muted px-1.5 py-0.5 normal-case">{voice.language}</span>}
      </div>

      {voice.summary && <p className="font-medium">{voice.summary}</p>}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {sameLanguage ? 'What they said' : 'In English'}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{voice.english}</p>
      </div>

      {!sameLanguage && (
        <div>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Languages className="size-3" />
            {showOriginal ? 'Hide' : 'Show'} original{voice.language ? ` (${voice.language})` : ''}
          </button>
          {showOriginal && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{voice.transcript}</p>}
        </div>
      )}

      {voice.suggested_reply && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <MessageSquareQuote className="size-3" />
            Suggested reply
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{voice.suggested_reply}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={useReply}
              className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Use this reply
            </button>
            <button
              type="button"
              onClick={() => void copy(voice.suggested_reply)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
