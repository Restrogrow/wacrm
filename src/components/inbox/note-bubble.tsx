"use client";

import { format } from "date-fns";
import { Lock, Trash2 } from "lucide-react";

import { splitMentions } from "@/lib/inbox/mentions";
import type { ConversationNote } from "./use-conversation-notes";

interface NoteBubbleProps {
  note: ConversationNote;
  authorName: string;
  /** Names of the people mentioned in this note, for highlighting. */
  mentionNames: string[];
  canDelete: boolean;
  onDelete: (id: string) => void;
}

/**
 * An internal note inside the thread. Deliberately unlike a message: full
 * width, dashed amber frame, a lock label — so nobody mistakes it for
 * something the customer can see.
 */
export function NoteBubble({ note, authorName, mentionNames, canDelete, onDelete }: NoteBubbleProps) {
  const segments = splitMentions(note.body, mentionNames);

  return (
    <div className="group flex justify-center px-2">
      <div className="w-full max-w-[85%] rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/10 px-4 py-2.5">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Internal note · only your team can see this
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-amber-500/20 focus:opacity-100 group-hover:opacity-100"
              title="Delete note"
              aria-label="Delete note"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm text-foreground">
          {segments.map((seg, i) =>
            seg.mention ? (
              <span key={i} className="rounded bg-amber-500/25 px-1 font-semibold text-amber-800 dark:text-amber-300">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {authorName} · {format(new Date(note.created_at), "HH:mm")}
        </p>
      </div>
    </div>
  );
}
