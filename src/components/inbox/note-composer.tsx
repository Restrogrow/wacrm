"use client";

import { useMemo, useRef, useState } from "react";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  MAX_NOTE_LENGTH,
  activeMentionQuery,
  applyMention,
  matchMembers,
  resolveMentions,
  type MentionMember,
} from "@/lib/inbox/mentions";
import { cn } from "@/lib/utils";
import type { ConversationNote } from "./use-conversation-notes";

interface NoteComposerProps {
  conversationId: string;
  /** Teammates that can be @mentioned (the current user is filtered out). */
  members: MentionMember[];
  onSaved: (note: ConversationNote) => void;
}

/**
 * Composer for internal notes. Nothing typed here is ever sent to WhatsApp:
 * it posts to /api/inbox/notes. Typing "@" opens a teammate picker.
 */
export function NoteComposer({ conversationId, members, onSaved }: NoteComposerProps) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<MentionMember[]>([]);
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const token = activeMentionQuery(text, caret);
  const matches = useMemo(() => (token ? matchMembers(members, token.query) : []), [token, members]);
  const menuOpen = !!token && matches.length > 0;

  function choose(member: MentionMember) {
    if (!token) return;
    const next = applyMention(text, token.start, caret, member.name);
    setText(next.text);
    setPicked((prev) => (prev.some((p) => p.id === member.id) ? prev : [...prev, member]));
    setIndex(0);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  async function save() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/inbox/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          body,
          mentions: resolveMentions(body, picked),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save the note");
      onSaved(json.note as ConversationNote);
      setText("");
      setPicked([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the note");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Lock className="h-3 w-3" />
        Internal note: your customer will not see this. Type @ to mention a teammate.
      </div>
      <div className="relative flex items-end gap-2">
        {menuOpen && (
          <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {matches.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                className={cn(
                  "block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted",
                  i === Math.min(index, matches.length - 1) && "bg-muted",
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          placeholder="Write a note for your team..."
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (menuOpen) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setIndex((i) => (i + step + matches.length) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                choose(matches[Math.min(index, matches.length - 1)]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void save();
            }
          }}
          className="field-sizing-content max-h-[40vh] min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-amber-500/40 bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-amber-500"
        />
        <Button
          type="button"
          size="icon"
          disabled={!text.trim() || sending}
          onClick={() => void save()}
          className="h-10 w-10 shrink-0 rounded-full bg-amber-500 text-white hover:bg-amber-600"
          aria-label="Save note"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
