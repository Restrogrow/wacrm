"use client";

// Floating help assistant: a chat bubble in the corner of every dashboard
// page. Ask "how do I…" and it answers and links to the right page.
// API: POST /api/assistant. It never reads or changes account data.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, RotateCcw, Send, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

import { cn } from "@/lib/utils";
import { parseAssistantReply } from "@/lib/ai/app-assistant";

type Turn = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "repeatgrow.assistant.v1";
const MAX_TURNS = 20;

const SUGGESTIONS = [
  "How do I send a broadcast?",
  "How do I create a template?",
  "How do I invite a teammate?",
  "How do I turn on the AI chatbot?",
];

// Full-screen builders own the whole viewport; a bubble would sit on top of
// their controls.
const HIDDEN_ON = [/^\/flows\/[^/]+/, /^\/automations\/new/, /^\/automations\/[^/]+\/edit/];

export function HelpWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore the conversation for this browser tab.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setTurns(JSON.parse(raw) as Turn[]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-MAX_TURNS)));
    } catch {
      /* ignore */
    }
  }, [turns]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, turns.length, busy]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN_ON.some((re) => re.test(pathname))) return null;

  async function ask(override?: string) {
    const text = (override ?? draft).trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setTurns([...next, { role: "assistant", content: String(json.reply ?? "") }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // The inbox composer lives bottom-right, so lift the bubble clear of it.
  const lifted = pathname.startsWith("/inbox");

  return (
    <div
      className={cn(
        "fixed right-4 z-40 flex flex-col items-end gap-3 sm:right-6",
        lifted ? "bottom-24" : "bottom-4 sm:bottom-6",
      )}
    >
      {open && (
        <div
          role="dialog"
          aria-label="Help assistant"
          className="flex h-[min(560px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-[var(--rail)] to-primary px-4 py-3.5 text-white">
            <BrandMark className="size-10 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Repeat Grow assistant</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/80">
                <span className="size-1.5 rounded-full bg-emerald-300" />
                Ask how to use the app
              </p>
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                aria-label="Start a new chat"
                title="New chat"
                className="flex size-8 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex size-8 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-primary-soft/30 p-4">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm">
                  Hi! 👋 I can show you how to do things in Repeat Grow — broadcasts, templates, automations,
                  integrations and more. What do you need?
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void ask(q)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground shadow-sm">
                    {t.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <p className="max-w-[90%] rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground shadow-sm">
                    {parseAssistantReply(t.content).map((part, j) =>
                      part.type === "text" ? (
                        <span key={j}>{part.text}</span>
                      ) : (
                        <Link
                          key={j}
                          href={part.href}
                          onClick={() => setOpen(false)}
                          className="mx-0.5 inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                        >
                          {part.label} →
                        </Link>
                      ),
                    )}
                  </p>
                </div>
              ),
            )}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Thinking…
              </div>
            )}
            {error && (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
            className="flex items-center gap-2 border-t border-border bg-card p-3"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask anything about the app…"
              maxLength={500}
              disabled={busy}
              className="h-10 flex-1 rounded-2xl border border-border bg-muted/60 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-opacity disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help assistant" : "Open help assistant"}
        aria-expanded={open}
        className="group flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/35 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <X className="size-6" />
        ) : (
          <BrandMark className="size-11 rounded-full transition-transform group-hover:-rotate-6" />
        )}
      </button>
    </div>
  );
}
