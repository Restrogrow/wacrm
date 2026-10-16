'use client';

// Recent WhatsApp calls with a contact, for the inbox contact panel.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { PhoneIncoming, PhoneMissed, PhoneOutgoing, Sparkles } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { CallNotes } from '@/lib/ai/call-notes';
import { CallNotesView } from './call-notes-view';

interface CallSummary {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
  duration_seconds: number | null;
  ai_notes?: CallNotes | null;
}

function describe(call: CallSummary): string {
  if (call.status === 'ended' || call.status === 'connected') {
    const d = call.duration_seconds;
    const length = d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}` : '';
    return `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call${length ? ` · ${length}` : ''}`;
  }
  if (call.status === 'missed') return call.direction === 'inbound' ? 'Missed call' : 'No answer';
  if (call.status === 'rejected') return call.direction === 'inbound' ? 'Declined' : 'Customer declined';
  if (call.status === 'failed') return 'Call failed';
  return 'Calling…';
}

export function RecentCalls({ contactId }: { contactId: string }) {
  const [calls, setCalls] = useState<CallSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const fetchCalls = (columns: string) =>
      supabase
        .from('whatsapp_calls')
        .select(columns)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(5);
    (async () => {
      let { data, error } = await fetchCalls('id, direction, status, created_at, duration_seconds, ai_notes');
      // ai_notes needs migration 057; fall back without it.
      if (error) ({ data, error } = await fetchCalls('id, direction, status, created_at, duration_seconds'));
      // Table missing (migration 048 not run) → just hide the section.
      if (!cancelled) setCalls(error ? [] : ((data ?? []) as unknown as CallSummary[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!calls || calls.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent calls</h4>
      <ul className="space-y-1.5">
        {calls.map((call) => {
          const missed = call.status === 'missed' || call.status === 'rejected' || call.status === 'failed';
          const Icon = missed ? PhoneMissed : call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
          return (
            <li key={call.id} className="text-xs">
              <div className="flex items-center gap-2">
                <Icon className={cn('size-3.5 shrink-0', missed ? 'text-red-500' : 'text-muted-foreground')} />
                <span className="min-w-0 flex-1 truncate text-foreground">{describe(call)}</span>
                {call.ai_notes && (
                  <button
                    type="button"
                    onClick={() => setOpen(open === call.id ? null : call.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary hover:bg-primary/15"
                    aria-expanded={open === call.id}
                  >
                    <Sparkles className="size-3" />
                    Notes
                  </button>
                )}
                <span className="shrink-0 text-muted-foreground">
                  {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                </span>
              </div>
              {open === call.id && call.ai_notes && (
                <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
                  <CallNotesView notes={call.ai_notes} compact />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/calls" className="mt-2 inline-block text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        All calls
      </Link>
    </div>
  );
}
