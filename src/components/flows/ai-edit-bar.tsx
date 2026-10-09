"use client";

/**
 * "Edit with AI" prompt bar for the flow editor.
 *
 * Sends the editor's live state + a plain-language instruction to
 * POST /api/flows/[id]/ai and drops the returned flow into the editor
 * as an UNSAVED change — the user sees it on the canvas, can Undo it
 * from the toast, and persists with the normal Save button. Requests
 * stack: each one builds on whatever is currently in the editor.
 */

import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useFlowEditor, type BuilderState } from "./flow-editor-state";
import type { BuilderNode, NodeType } from "./shared";

interface AiEditResponse {
  flow: {
    name: string;
    description: string | null;
    trigger_type: BuilderState["trigger_type"];
    trigger_config: Record<string, unknown>;
    entry_node_id: string;
  };
  nodes: Array<{ node_key: string; node_type: string; config: Record<string, unknown> }>;
  error?: string;
}

/**
 * Merge AI nodes into editor nodes. If the set of steps is unchanged we
 * keep the user's canvas positions; if steps were added or removed we
 * zero every position so the canvas re-runs its automatic layout
 * instead of stacking new steps at (0,0).
 */
export function mergeAiNodes(
  prev: BuilderNode[],
  next: AiEditResponse["nodes"],
): BuilderNode[] {
  const prevByKey = new Map(prev.map((n) => [n.node_key, n]));
  const sameShape =
    prev.length === next.length && next.every((n) => prevByKey.has(n.node_key));
  return next.map((n) => {
    const old = prevByKey.get(n.node_key);
    return {
      node_key: n.node_key,
      node_type: n.node_type as NodeType,
      config: n.config,
      position_x: sameShape ? (old?.position_x ?? 0) : 0,
      position_y: sameShape ? (old?.position_y ?? 0) : 0,
    };
  });
}

const EXAMPLES = [
  "Add a 'Talk to us' button that hands the chat to the team",
  "Write the welcome message in Hindi",
  "Also start this flow when someone types 'menu'",
];

export function AiEditBar() {
  const { flow, state, setState } = useFlowEditor();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  async function apply() {
    const instruction = prompt.trim();
    if (!instruction || busy) return;
    setBusy(true);
    const before = state;
    try {
      const res = await fetch(`/api/flows/${flow.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: instruction,
          current: {
            name: state.name,
            description: state.description || null,
            trigger_type: state.trigger_type,
            trigger_config: state.trigger_config,
            entry_node_id: state.entry_node_id,
            nodes: state.nodes.map((n) => ({
              node_key: n.node_key,
              node_type: n.node_type,
              config: n.config,
            })),
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as AiEditResponse;
      if (!res.ok) throw new Error(json.error ?? `AI edit failed: ${res.status}`);

      setState((s) => ({
        ...s,
        name: json.flow.name || s.name,
        description: json.flow.description ?? s.description,
        trigger_type: json.flow.trigger_type,
        trigger_config: json.flow.trigger_config,
        entry_node_id: json.flow.entry_node_id,
        nodes: mergeAiNodes(s.nodes, json.nodes),
      }));
      setHistory((h) => [instruction, ...h].slice(0, 5));
      setPrompt("");
      toast.success("AI updated the flow — review it, then Save.", {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => setState(before),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI edit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 pt-3">
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-1.5 pl-3">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          disabled={busy}
          maxLength={2000}
          placeholder={`Edit with AI — e.g. "${EXAMPLES[0]}"`}
          aria-label="Describe a change for AI"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" onClick={() => void apply()} disabled={!prompt.trim() || busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "Updating…" : "Apply"}
        </Button>
      </div>
      {history.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Undo2 className="h-3 w-3" />
          <span>AI changes this session:</span>
          {history.map((h, i) => (
            <span key={i} className="max-w-[260px] truncate rounded-full bg-muted px-2 py-0.5">
              {h}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLES.slice(1).map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
