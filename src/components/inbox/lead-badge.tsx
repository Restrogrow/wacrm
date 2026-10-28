"use client";

// AI lead badge: "Lead 82" with intent and mood, from `conversation_ai`
// (migration 074, written by the cron job / the analyse route). One shared
// store fetches the scores for the account and refreshes every minute, so
// any number of badges on screen costs a single query.

import { useSyncExternalStore } from "react";
import { Flame } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { INTENT_LABELS, type Intent, type Sentiment } from "@/lib/ai/lead-types";

const REFRESH_MS = 60_000;

interface Row {
  intent: Intent;
  sentiment: Sentiment;
  lead_score: number;
  reason: string | null;
}

let rows: ReadonlyMap<string, Row> = new Map();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let loading = false;

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const query = (cols: string) =>
      createClient()
        .from("conversation_ai")
        .select(cols)
        .order("analyzed_at", { ascending: false })
        .limit(1000);
    let { data, error } = await query("conversation_id, intent, sentiment, lead_score, reason");
    // Migration 088 (reason) not applied yet.
    if (error) ({ data, error } = await query("conversation_id, intent, sentiment, lead_score"));
    // Table missing (migration not applied) or signed out: show nothing.
    const next = new Map<string, Row>(
      error
        ? []
        : ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => [
            r.conversation_id as string,
            {
              intent: r.intent as Intent,
              sentiment: r.sentiment as Sentiment,
              lead_score: r.lead_score as number,
              reason: (r.reason as string | null | undefined) ?? null,
            },
          ]),
    );
    const changed =
      next.size !== rows.size ||
      [...next].some(([id, v]) => {
        const old = rows.get(id);
        return (
          !old ||
          old.lead_score !== v.lead_score ||
          old.reason !== v.reason ||
          old.intent !== v.intent ||
          old.sentiment !== v.sentiment
        );
      });
    if (changed) {
      rows = next;
      listeners.forEach((l) => l());
    }
  } catch {
    // Network blip: keep the last known state.
  } finally {
    loading = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => rows;
const getServerSnapshot = () => rows;

export function useLeadScore(conversationId: string | null | undefined): Row | null {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (conversationId && map.get(conversationId)) || null;
}

function tone(score: number): string {
  if (score >= 70) return "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400";
  if (score >= 40) return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-border bg-muted text-muted-foreground";
}

export function LeadBadge({
  conversationId,
  compact = false,
  className,
}: {
  conversationId: string | null | undefined;
  /** Score only, for the crowded conversation list. */
  compact?: boolean;
  className?: string;
}) {
  const row = useLeadScore(conversationId);
  if (!row) return null;
  // Keep the list quiet: only chats worth a second look get a badge there.
  if (compact && row.lead_score < 40 && row.sentiment !== "negative") return null;
  const mood = row.sentiment === "negative" ? " · unhappy" : "";
  return (
    <span
      title={`AI read: ${INTENT_LABELS[row.intent]} · mood ${row.sentiment} · lead score ${row.lead_score}/100${row.reason ? `\nWhy: ${row.reason}` : ""}`}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
        row.sentiment === "negative" && row.lead_score < 40
          ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
          : tone(row.lead_score),
        className,
      )}
    >
      <Flame className="size-3 shrink-0" />
      <span className="truncate">
        {compact ? row.lead_score : `Lead ${row.lead_score} · ${INTENT_LABELS[row.intent]}${mood}`}
      </span>
    </span>
  );
}
