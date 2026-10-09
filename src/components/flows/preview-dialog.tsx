"use client";

/**
 * Preview — a WhatsApp-style chat that runs the CURRENT (possibly
 * unsaved) flow in the browser via lib/flows/simulate. Nothing is sent
 * and nothing is written; tags/handoffs show as system notes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, List, RotateCcw, Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  startSimulation,
  tapReply,
  typeText,
  type SimMessage,
  type SimNode,
  type SimState,
} from "@/lib/flows/simulate";
import { useFlowEditor } from "./flow-editor-state";

export function PreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state } = useFlowEditor();
  const [tagNames, setTagNames] = useState<Record<string, string>>({});
  // Mounted only while open (see header.tsx), so each open starts fresh.
  const [sim, setSim] = useState<SimState | null>(() =>
    startSimulation(
      state.nodes.map((n) => ({ node_key: n.node_key, node_type: n.node_type, config: n.config })),
      state.entry_node_id,
    ),
  );
  const [draft, setDraft] = useState("");
  const [openList, setOpenList] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nodes: SimNode[] = useMemo(
    () =>
      state.nodes.map((n) => ({
        node_key: n.node_key,
        node_type: n.node_type,
        config: n.config,
      })),
    [state.nodes],
  );

  const keywords = useMemo(() => {
    const k = (state.trigger_config as { keywords?: unknown }).keywords;
    return Array.isArray(k) ? (k as string[]) : [];
  }, [state.trigger_config]);

  // Tag names so "Tag added" notes are readable.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient().from("tags").select("id, name");
      if (!cancelled && data) {
        setTagNames(Object.fromEntries(data.map((t) => [t.id as string, t.name as string])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const restart = () => {
    setSim(startSimulation(nodes, state.entry_node_id, tagNames));
    setDraft("");
    setOpenList(null);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sim?.messages.length, openList]);

  const tap = (replyId: string) => {
    if (!sim) return;
    setSim(tapReply(nodes, sim, replyId, tagNames));
    setOpenList(null);
  };
  const send = () => {
    if (!sim || !draft.trim()) return;
    setSim(typeText(nodes, sim, draft, tagNames));
    setDraft("");
  };

  const lastBotIndex = sim
    ? sim.messages.reduce((acc, m, i) => (m.from === "bot" ? i : acc), -1)
    : -1;
  const canType = sim?.status === "waiting_text" || sim?.status === "waiting_tap";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-3 bg-popover text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {state.trigger_type === "keyword"
              ? `Starts when a customer sends: ${keywords.join(", ") || "(no keywords yet)"}`
              : state.trigger_type === "first_inbound_message"
                ? "Starts on a contact's first message"
                : "Manual trigger"}
            . Nothing is sent — includes unsaved changes.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[360px] flex-1 overflow-y-auto rounded-xl border border-border bg-[#0b141a] p-3">
          <div className="flex flex-col gap-2">
            {sim?.messages.map((m, i) => (
              <Bubble
                key={i}
                message={m}
                interactive={i === lastBotIndex && sim.status === "waiting_tap"}
                listOpen={openList === i}
                onToggleList={() => setOpenList(openList === i ? null : i)}
                onTap={tap}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            disabled={!canType}
            placeholder={
              sim?.status === "waiting_text"
                ? "Type the customer's answer…"
                : canType
                  ? "Tap an option above, or type to test a wrong answer"
                  : "Flow finished — restart to try again"
            }
            className="min-w-0 flex-1 rounded-full border border-border bg-muted px-3.5 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
          <Button size="icon" onClick={send} disabled={!canType || !draft.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={restart} aria-label="Restart preview" title="Restart">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bubble({
  message: m,
  interactive,
  listOpen,
  onToggleList,
  onTap,
}: {
  message: SimMessage;
  interactive: boolean;
  listOpen: boolean;
  onToggleList: () => void;
  onTap: (replyId: string) => void;
}) {
  if (m.from === "system") {
    return (
      <div
        className={cn(
          "mx-auto max-w-[90%] rounded-md px-2.5 py-1 text-center text-[11px]",
          m.tone === "error"
            ? "bg-red-500/15 text-red-300"
            : m.tone === "warn"
              ? "bg-amber-500/15 text-amber-200"
              : "bg-white/5 text-slate-300",
        )}
      >
        {m.text}
      </div>
    );
  }
  if (m.from === "user") {
    return (
      <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-lg rounded-tr-sm bg-[#005c4b] px-3 py-1.5 text-sm text-white">
        {m.text}
      </div>
    );
  }

  const shell = "max-w-[85%] rounded-lg rounded-tl-sm bg-[#202c33] text-sm text-slate-100";
  if (m.kind === "media") {
    return (
      <div className={cn(shell, "px-3 py-2")}>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">[{m.media_type}]</div>
        {m.caption && <WaText text={m.caption} />}
      </div>
    );
  }

  const header = m.kind !== "text" ? m.header : undefined;
  const footer = m.kind !== "text" ? m.footer : undefined;
  return (
    <div className={shell}>
      <div className="px-3 py-2">
        {header && <div className="mb-1 font-semibold">{header}</div>}
        <WaText text={m.text} />
        {footer && <div className="mt-1 text-[11px] text-slate-400">{footer}</div>}
      </div>
      {m.kind === "text" && m.link && (
        <a
          href={m.link.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[13px] text-sky-300 hover:bg-white/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {m.link.label}
        </a>
      )}
      {m.kind === "buttons" &&
        m.buttons.map((b) => (
          <button
            key={b.reply_id}
            type="button"
            disabled={!interactive}
            onClick={() => onTap(b.reply_id)}
            className="block w-full border-t border-white/10 py-2 text-center text-[13px] text-sky-300 enabled:hover:bg-white/5 disabled:opacity-50"
          >
            {b.title}
          </button>
        ))}
      {m.kind === "list" && (
        <>
          <button
            type="button"
            disabled={!interactive}
            onClick={onToggleList}
            className="flex w-full items-center justify-center gap-1.5 border-t border-white/10 py-2 text-[13px] text-sky-300 enabled:hover:bg-white/5 disabled:opacity-50"
          >
            <List className="h-3.5 w-3.5" />
            {m.button_label}
          </button>
          {listOpen && interactive && (
            <div className="border-t border-white/10 py-1">
              {m.sections.map((s, si) => (
                <div key={si}>
                  {s.title && (
                    <div className="px-3 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wide text-emerald-400">
                      {s.title}
                    </div>
                  )}
                  {s.rows.map((r) => (
                    <button
                      key={r.reply_id}
                      type="button"
                      onClick={() => onTap(r.reply_id)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                    >
                      <div className="text-[13px]">{r.title}</div>
                      {r.description && (
                        <div className="text-[11px] text-slate-400">{r.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** WhatsApp-style *bold* + line breaks. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </div>
  );
}
