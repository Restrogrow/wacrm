"use client";

// "Reply overdue" pill for conversations that broke the account's
// first-response target (cron job → `conversation_sla`, migration 066).
// One shared store fetches the open breaches and refreshes every
// minute, so any number of badges on screen costs a single query.

import { useSyncExternalStore } from "react";
import { AlarmClock } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

let breached: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let loading = false;

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const { data, error } = await createClient()
      .from("conversation_sla")
      .select("conversation_id")
      .is("cleared_at", null)
      .limit(1000);
    // Table missing (migration not applied) or signed out: show nothing.
    const next = new Set<string>(
      error ? [] : (data ?? []).map((r) => r.conversation_id as string),
    );
    const changed =
      next.size !== breached.size || [...next].some((id) => !breached.has(id));
    if (changed) {
      breached = next;
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

const getSnapshot = () => breached;
const getServerSnapshot = () => breached;

export function useSlaBreached(conversationId: string | null | undefined): boolean {
  const set = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return !!conversationId && set.has(conversationId);
}

export function SlaBadge({
  conversationId,
  compact = false,
  className,
}: {
  conversationId: string | null | undefined;
  /** Icon-only, for the crowded conversation list. */
  compact?: boolean;
  className?: string;
}) {
  const isBreached = useSlaBreached(conversationId);
  if (!isBreached) return null;
  return (
    <span
      title="This customer has waited longer than your reply-time target"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400",
        className,
      )}
    >
      <AlarmClock className="size-3 shrink-0" />
      {!compact && <span>SLA breached</span>}
    </span>
  );
}
