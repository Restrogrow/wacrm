'use client';

// Recent WhatsApp calls with a contact, for the inbox contact panel.

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface CallSummary {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  created_at: string;
  duration_seconds: number | null;
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

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from('whatsapp_calls')
      .select('id, direction, status, created_at, duration_seconds')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        // Table missing (migration 048 not run) → just hide the section.
        if (!cancelled) setCalls(error ? [] : ((data ?? []) as CallSummary[]));
      });
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
            <li key={call.id} className="flex items-center gap-2 text-xs">
              <Icon className={cn('size-3.5 shrink-0', missed ? 'text-red-500' : 'text-muted-foreground')} />
              <span className="min-w-0 flex-1 truncate text-foreground">{describe(call)}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
