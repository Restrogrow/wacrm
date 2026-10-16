'use client';

// Calls: every WhatsApp voice call for the business, newest first, with
// who handled it, how long it lasted and its AI call notes. Filters for
// calls with AI notes and missed calls. ?call=<id> opens one call.

import { PageHero } from "@/components/layout/page-hero";
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Sparkles,
  Phone,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CallNotesView } from '@/components/calls/call-notes-view';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { CallNotes } from '@/lib/ai/call-notes';

interface CallRow {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
  duration_seconds: number | null;
  customer_name: string | null;
  customer_number: string | null;
  conversation_id: string | null;
  answered_by: string | null;
  started_by: string | null;
  ai_notes?: CallNotes | null;
}

type Filter = 'all' | 'notes' | 'missed';

const PAGE = 50;
const BASE_COLUMNS =
  'id, direction, status, created_at, duration_seconds, customer_name, customer_number, conversation_id, answered_by, started_by';
const MISSED = ['missed', 'rejected', 'failed'];

function duration(seconds: number | null): string {
  if (!seconds) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function outcome(call: CallRow): string {
  if (call.status === 'missed') return call.direction === 'inbound' ? 'Missed' : 'No answer';
  if (call.status === 'rejected') return 'Declined';
  if (call.status === 'failed') return 'Failed';
  if (call.status === 'ended' || call.status === 'connected') return duration(call.duration_seconds) || 'Answered';
  return 'In progress';
}

function CallsPageInner() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('call');
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(focusId);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notesColumn, setNotesColumn] = useState(true);

  const load = useCallback(
    async (offset: number, which: Filter) => {
      const supabase = createClient();
      const query = (columns: string) => {
        let q = supabase
          .from('whatsapp_calls')
          .select(columns)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (which === 'missed') q = q.in('status', MISSED);
        if (which === 'notes') q = q.not('ai_notes', 'is', null);
        return q;
      };
      let { data, error } = await query(`${BASE_COLUMNS}, ai_notes`);
      if (error && /ai_notes/.test(error.message)) {
        // Migration 057 not run yet: list calls without notes.
        setNotesColumn(false);
        ({ data, error } = await query(BASE_COLUMNS));
      }
      return { rows: ((error ? [] : data) ?? []) as unknown as CallRow[] };
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { rows } = await load(0, filter);
      if (cancelled) return;
      setCalls(rows);
      setHasMore(rows.length === PAGE);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, load]);

  // Opened from a notification (?call=<id>): bring that call into view.
  useEffect(() => {
    if (!focusId || !calls?.length) return;
    document.getElementById(`call-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId, calls]);

  // Teammate names for "handled by".
  useEffect(() => {
    if (!calls?.length) return;
    const ids = [...new Set(calls.flatMap((c) => [c.answered_by, c.started_by]).filter((x): x is string => !!x))];
    const missing = ids.filter((id) => !names[id]);
    if (!missing.length) return;
    void createClient()
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', missing)
      .then(({ data }) => {
        if (!data) return;
        setNames((prev) => {
          const next = { ...prev };
          for (const p of data as { user_id: string; full_name: string | null }[]) next[p.user_id] = p.full_name || 'Teammate';
          return next;
        });
      });
  }, [calls, names]);

  async function loadMore() {
    if (!calls) return;
    setLoadingMore(true);
    const { rows } = await load(calls.length, filter);
    setCalls([...calls, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadingMore(false);
  }

  const counts = useMemo(() => {
    const list = calls ?? [];
    return { notes: list.filter((c) => c.ai_notes).length };
  }, [calls]);

  return (
    <div className="space-y-6">
      <PageHero
        icon={Phone}
        title="Calls"
        description="Every WhatsApp call with your customers, and the AI notes from calls where an agent switched them on."
      />

      {!notesColumn && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Run migration <code>057_call_ai_notes.sql</code> in Supabase to keep AI notes with each call. Until then,
          notes are saved on the contact only.
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ['all', 'All calls'],
            ['notes', 'With AI notes'],
            ['missed', 'Missed'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1 transition-colors',
              filter === key ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {key === 'notes' && filter === 'all' && counts.notes > 0 ? ` (${counts.notes})` : ''}
          </button>
        ))}
      </div>

      {!calls ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : calls.length === 0 ? (
        <p className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
          {filter === 'notes'
            ? 'No calls with AI notes yet. During a call, click the sparkles button on the call card.'
            : filter === 'missed'
              ? 'No missed calls.'
              : 'No WhatsApp calls yet.'}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border">
          {calls.map((call) => {
            const missed = MISSED.includes(call.status);
            const Icon = missed ? PhoneMissed : call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
            const who = call.customer_name || (call.customer_number ? `+${call.customer_number}` : 'WhatsApp caller');
            const agentId = call.answered_by || call.started_by;
            const expanded = open === call.id;
            return (
              <div key={call.id} id={`call-${call.id}`}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : call.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <Icon className={cn('size-4 shrink-0', missed ? 'text-red-500' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{who}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} · {outcome(call)}
                      {agentId && names[agentId] ? ` · ${names[agentId]}` : ''}
                    </p>
                  </div>
                  {call.ai_notes && (
                    <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">
                      <Sparkles className="size-3" />
                      AI notes
                    </span>
                  )}
                  <span
                    className="shrink-0 text-xs text-muted-foreground"
                    title={format(new Date(call.created_at), 'd MMM yyyy, h:mm a')}
                  >
                    {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-4">
                    {call.ai_notes ? (
                      <CallNotesView notes={call.ai_notes} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No AI notes for this call. Next time, click the sparkles button on the call card while you talk.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{format(new Date(call.created_at), 'd MMM yyyy, h:mm a')}</span>
                      {call.conversation_id && (
                        <Link
                          href={`/inbox?c=${call.conversation_id}`}
                          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          <MessageSquare className="size-3.5" />
                          Open chat
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            Load more calls
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={null}>
      <CallsPageInner />
    </Suspense>
  );
}
