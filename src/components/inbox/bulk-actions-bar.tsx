"use client";

// Bulk actions for selected inbox conversations: assign, change status,
// add a tag, mark read. Talks to POST /api/inbox/conversations/bulk, which
// re-checks every id against the account, so this is only the UI.

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Tag } from "@/types";

interface BulkActionsBarProps {
  selectedIds: string[];
  tags: Tag[];
  onDone: () => void;
}

interface Member {
  user_id: string;
  label: string;
}

type BulkPayload =
  | { action: "assign"; value: string | null }
  | { action: "status"; value: "open" | "pending" | "closed" }
  | { action: "tag"; value: string }
  | { action: "mark_read" };

const trigger =
  "inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50";

export function BulkActionsBar({ selectedIds, tags, onDone }: BulkActionsBarProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMembers(
          data.map((p) => ({ user_id: p.user_id as string, label: (p.full_name as string) || (p.email as string) })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(payload: BulkPayload, success: string) {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/conversations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not update the conversations");
      toast.success(`${success} (${json.updated ?? selectedIds.length})`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the conversations");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-primary-soft/50 px-3 py-2">
      <span className="mr-1 text-xs font-semibold text-foreground">{selectedIds.length} selected</span>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

      <DropdownMenu>
        <DropdownMenuTrigger className={trigger} disabled={busy}>
          Assign
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto border-border bg-popover">
          {members.map((m) => (
            <DropdownMenuItem key={m.user_id} onClick={() => run({ action: "assign", value: m.user_id }, "Assigned")}>
              {m.label}
            </DropdownMenuItem>
          ))}
          {members.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={() => run({ action: "assign", value: null }, "Unassigned")}>Unassign</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className={trigger} disabled={busy}>
          Status
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="border-border bg-popover">
          <DropdownMenuItem onClick={() => run({ action: "status", value: "open" }, "Marked open")}>Open</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run({ action: "status", value: "pending" }, "Marked pending")}>Pending</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run({ action: "status", value: "closed" }, "Closed")}>Closed</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {tags.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={trigger} disabled={busy}>
            Add tag
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto border-border bg-popover">
            {tags.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => run({ action: "tag", value: t.id }, `Tagged "${t.name}"`)}>
                <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="truncate">{t.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <button type="button" className={trigger} disabled={busy} onClick={() => run({ action: "mark_read" }, "Marked read")}>
        Mark read
      </button>

      <button
        type="button"
        onClick={onDone}
        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Exit selection"
        title="Exit selection"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
