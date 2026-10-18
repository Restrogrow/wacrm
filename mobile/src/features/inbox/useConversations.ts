import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { fetchConversation, fetchConversations, searchConversations } from './queries';
import type { InboxConversation, InboxFilter } from './types';

function matchesFilter(c: InboxConversation, filter: InboxFilter, userId: string | null) {
  switch (filter) {
    case 'mine':
      return !!userId && c.assigned_agent_id === userId;
    case 'unassigned':
      return !c.assigned_agent_id;
    case 'unread':
      return c.unread_count > 0;
    case 'open':
    case 'pending':
    case 'closed':
      return c.status === filter;
    default:
      return true;
  }
}

const byActivity = (a: InboxConversation, b: InboxConversation) => {
  const x = a.last_message_at ?? '';
  const y = b.last_message_at ?? '';
  if (x !== y) return y.localeCompare(x);
  return b.id.localeCompare(a.id);
};

/**
 * Conversation list state: filter + search, paging, pull to refresh, and live updates
 * (realtime changes to the account's conversations re-sort the list in place).
 */
export function useConversations(filter: InboxFilter, search: string) {
  const { accountId, session } = useSession();
  const userId = session?.user.id ?? null;
  const [rows, setRows] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searching = search.trim().length > 0;
  const seq = useRef(0);
  const rowsRef = useRef<InboxConversation[]>([]);
  rowsRef.current = rows;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const mine = ++seq.current;
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      try {
        if (searching) {
          const found = await searchConversations(search, filter, userId);
          if (mine !== seq.current) return;
          setRows(found);
          setHasMore(false);
        } else {
          const page = await fetchConversations({ filter, userId, offset: 0 });
          if (mine !== seq.current) return;
          setRows(page.rows);
          setHasMore(page.hasMore);
        }
        setError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e instanceof Error ? e.message : 'Could not load conversations.');
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filter, search, searching, userId],
  );

  // Reload when the filter changes; debounce typing in the search box.
  useEffect(() => {
    if (!accountId) return;
    const t = setTimeout(() => void load('initial'), searching ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, accountId, searching]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || searching) return;
    setLoadingMore(true);
    try {
      const page = await fetchConversations({ filter, userId, offset: rowsRef.current.length });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      /* keep what we have; the user can pull to refresh */
    } finally {
      setLoadingMore(false);
    }
  }, [filter, hasMore, loadingMore, searching, userId]);

  // Live updates.
  useEffect(() => {
    if (!accountId) return;
    const apply = async (id: string) => {
      const fresh = await fetchConversation(id).catch(() => null);
      if (!fresh) return;
      setRows((prev) => {
        const without = prev.filter((r) => r.id !== id);
        if (searching || !matchesFilter(fresh, filter, userId)) return without;
        return [...without, fresh].sort(byActivity);
      });
    };
    const channel = supabase
      .channel(`inbox-list-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `account_id=eq.${accountId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id?: string };
          if (old.id) setRows((prev) => prev.filter((r) => r.id !== old.id));
          return;
        }
        const id = (payload.new as { id?: string }).id;
        if (id) void apply(id);
      })
      .subscribe();

    // Catch up after the app has been in the background (events were missed).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load('refresh');
    });
    return () => {
      sub.remove();
      supabase.removeChannel(channel);
    };
  }, [accountId, filter, searching, userId, load]);

  /** Local patch used by the thread (status/assignee/unread) so the list updates instantly. */
  const patch = useCallback((id: string, changes: Partial<InboxConversation>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }, []);

  return { rows, loading, refreshing, loadingMore, hasMore, error, refresh: () => load('refresh'), reload: () => load('initial'), loadMore, patch };
}
