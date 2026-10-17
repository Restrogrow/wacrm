"use client";

// "Suggest reply" (sparkle) button in the composer toolbar. Asks the AI for
// three short drafts based on the latest messages. Clicking one drops it
// into the message box (the same event the voice-note AI uses); it is never
// sent automatically. API: POST /api/inbox/conversations/[id]/suggest-replies.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INSERT_REPLY_EVENT } from "./voice-note-ai";

export function SuggestRepliesButton({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [forId, setForId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversationId}/suggest-replies`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSuggestions([]);
        setError(
          res.status === 503
            ? "AI is not set up for this workspace yet."
            : (body?.error ?? "Could not suggest replies."),
        );
        return;
      }
      setSuggestions(Array.isArray(body?.suggestions) ? body.suggestions : []);
      setForId(conversationId);
    } catch {
      setSuggestions([]);
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(open: boolean) {
    // Reuse the drafts if the menu is reopened for the same chat.
    if (open && forId !== conversationId && !loading) void load();
  }

  function pick(text: string) {
    window.dispatchEvent(
      new CustomEvent(INSERT_REPLY_EVENT, { detail: { text } }),
    );
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        disabled={disabled}
        title={disabled ? undefined : "Suggest a reply (AI)"}
        aria-label="Suggest a reply"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-0 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-96 w-80 max-w-[90vw] overflow-y-auto border-border bg-popover"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Suggested replies (edit before sending)
        </div>
        {loading && (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        {!loading && error && (
          <div className="px-2 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {!loading &&
          !error &&
          suggestions.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => pick(s)}
              className="cursor-pointer whitespace-normal py-2 text-sm leading-snug"
            >
              {s}
            </DropdownMenuItem>
          ))}
        {!loading && (error || suggestions.length > 0) && (
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              void load();
            }}
            className="cursor-pointer text-xs text-muted-foreground"
          >
            Try again
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
