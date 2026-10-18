import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

/**
 * Number of conversations with unread customer messages (same meaning as the web sidebar dot).
 * Live: starts with one query, then adjusts from realtime events.
 */
export function useUnreadCount(): number {
  const { session } = useSession();
  const [total, setTotal] = useState(0);
  const counts = useRef<Map<string, number>>(new Map());
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setTotal(0);
      return;
    }
    let cancelled = false;
    const recompute = () => {
      let sum = 0;
      for (const n of counts.current.values()) if (n > 0) sum += 1;
      setTotal(sum);
    };

    supabase
      .from('conversations')
      .select('id, unread_count')
      .then(({ data }) => {
        if (cancelled || !data) return;
        counts.current = new Map((data as { id: string; unread_count: number | null }[]).map((r) => [r.id, r.unread_count ?? 0]));
        recompute();
      });

    const channel = supabase
      .channel(`unread-count-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id?: string };
          if (old.id) counts.current.delete(old.id);
        } else {
          const row = payload.new as { id: string; unread_count?: number | null };
          counts.current.set(row.id, row.unread_count ?? 0);
        }
        recompute();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return total;
}
