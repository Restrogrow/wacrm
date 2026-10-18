import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { windowInfo } from './format';
import {
  fetchConversation,
  fetchMessage,
  fetchMessages,
  fetchNotes,
  fetchReactions,
  markRead,
  MESSAGES_PAGE,
} from './queries';
import type { InboxConversation, InboxMessage, InboxNote, InboxReaction } from './types';

export type TimelineItem =
  | { kind: 'message'; id: string; created_at: string; message: InboxMessage }
  | { kind: 'note'; id: string; created_at: string; note: InboxNote };

export interface SendPayload {
  message_type: 'text' | 'image' | 'document' | 'video' | 'audio' | 'template';
  content_text?: string;
  media_url?: string;
  filename?: string;
  template_name?: string;
  template_language?: string | null;
  template_params?: string[];
  template_message_params?: unknown;
  reply_to_message_id?: string | null;
}

const byTime = (a: { created_at: string }, b: { created_at: string }) => Date.parse(b.created_at) - Date.parse(a.created_at);

/** Everything the chat screen needs: messages, notes, reactions, live updates, and sending. */
export function useThread(conversationId: string) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [conversation, setConversation] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]); // newest first
  const [notes, setNotes] = useState<InboxNote[]>([]);
  const [reactions, setReactions] = useState<InboxReaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const payloads = useRef<Map<string, SendPayload>>(new Map());
  const messagesRef = useRef<InboxMessage[]>([]);
  messagesRef.current = messages;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [conv, page, n, r] = await Promise.all([
        fetchConversation(conversationId),
        fetchMessages(conversationId, 0),
        fetchNotes(conversationId),
        fetchReactions(conversationId),
      ]);
      setConversation(conv);
      // Keep unsent/failed local messages when reloading.
      setMessages((prev) => [...prev.filter((m) => m.pending), ...page.rows].sort(byTime));
      setHasEarlier(page.hasMore);
      setNotes(n);
      setReactions(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this chat.');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setNotes([]);
    setReactions([]);
    void load();
  }, [load]);

  // Clear the unread badge once the chat is open (and again when new customer messages arrive).
  const unread = conversation?.unread_count ?? 0;
  useEffect(() => {
    if (unread > 0) void markRead(conversationId).then(() => setConversation((c) => (c ? { ...c, unread_count: 0 } : c)));
  }, [conversationId, unread]);

  // Live updates for this chat.
  useEffect(() => {
    const id = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`thread-${conversationId}-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as InboxMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // Replace our optimistic copy of the same outgoing text, if it is still showing.
            const dupe = prev.find((m) => m.pending && m.sender_type === 'agent' && m.content_text === row.content_text && m.content_type === row.content_type);
            const rest = dupe ? prev.filter((m) => m.id !== dupe.id) : prev;
            if (dupe) payloads.current.delete(dupe.id);
            return [row, ...rest].sort(byTime);
          });
          // Customer replied while the chat is open: it counts as read.
          if (row.sender_type === 'customer') void markRead(conversationId);
        } else if (payload.eventType === 'UPDATE') {
          const row = payload.new as InboxMessage;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as { id?: string };
          if (old.id) setMessages((prev) => prev.filter((m) => m.id !== old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_notes', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const row = payload.new as InboxNote;
          setNotes((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev].sort(byTime)));
        } else if (payload.eventType === 'DELETE') {
          const old = payload.old as { id?: string };
          if (old.id) setNotes((prev) => prev.filter((n) => n.id !== old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${conversationId}` }, () => {
        void fetchReactions(conversationId).then(setReactions);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` }, () => {
        void fetchConversation(conversationId).then((c) => c && setConversation((prev) => (prev ? { ...prev, ...c, unread_count: prev.unread_count === 0 ? 0 : c.unread_count } : c)));
      })
      .subscribe();

    // Events are missed while the app is in the background; resync on return.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      sub.remove();
      supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const loadEarlier = useCallback(async () => {
    if (loadingEarlier || !hasEarlier) return;
    setLoadingEarlier(true);
    try {
      const offset = messagesRef.current.filter((m) => !m.pending).length;
      const page = await fetchMessages(conversationId, offset);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...page.rows.filter((m) => !seen.has(m.id))].sort(byTime);
      });
      setHasEarlier(page.hasMore);
    } catch {
      /* try again on the next scroll */
    } finally {
      setLoadingEarlier(false);
    }
  }, [conversationId, hasEarlier, loadingEarlier]);

  const patchMessage = useCallback((id: string, changes: Partial<InboxMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  }, []);

  const deliver = useCallback(
    async (tempId: string, payload: SendPayload) => {
      payloads.current.set(tempId, payload);
      try {
        const res = await api<{ message_id?: string }>('/api/whatsapp/send', {
          method: 'POST',
          body: { conversation_id: conversationId, ...payload },
        });
        payloads.current.delete(tempId);
        const realId = res.message_id;
        if (realId) {
          const real = await fetchMessage(realId);
          setMessages((prev) => {
            const rest = prev.filter((m) => m.id !== tempId);
            if (!real || rest.some((m) => m.id === real.id)) return rest;
            return [real, ...rest].sort(byTime);
          });
        } else {
          patchMessage(tempId, { pending: false, status: 'sent' });
        }
        return { ok: true as const };
      } catch (e) {
        patchMessage(tempId, { status: 'failed', pending: true });
        return { ok: false as const, error: e instanceof ApiError ? e.message : 'Could not send the message.' };
      }
    },
    [conversationId, patchMessage],
  );

  /** Send a message with an optimistic bubble. Resolves with ok/error so the UI can toast. */
  const send = useCallback(
    async (payload: SendPayload, preview: Pick<InboxMessage, 'content_type' | 'content_text' | 'media_url' | 'template_name'>) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const optimistic: InboxMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: userId,
        status: 'sending',
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.reply_to_message_id ?? null,
        interactive_reply_id: null,
        pending: true,
        ...preview,
      };
      setMessages((prev) => [optimistic, ...prev].sort(byTime));
      return deliver(tempId, payload);
    },
    [conversationId, deliver, userId],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const payload = payloads.current.get(tempId);
      if (!payload) return { ok: false as const, error: 'This message can no longer be retried. Please send it again.' };
      patchMessage(tempId, { status: 'sending' });
      return deliver(tempId, payload);
    },
    [deliver, patchMessage],
  );

  const discard = useCallback((tempId: string) => {
    payloads.current.delete(tempId);
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  const addNote = useCallback(async (body: string, mentions: string[] = []) => {
    const res = await api<{ note: InboxNote }>('/api/inbox/notes', { method: 'POST', body: { conversation_id: conversationId, body, mentions } });
    setNotes((prev) => (prev.some((n) => n.id === res.note.id) ? prev : [res.note, ...prev].sort(byTime)));
  }, [conversationId]);

  const deleteNote = useCallback(async (id: string) => {
    await api(`/api/inbox/notes/${id}`, { method: 'DELETE' });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ kind: 'message' as const, id: m.id, created_at: m.created_at, message: m })),
      ...notes.map((n) => ({ kind: 'note' as const, id: `note-${n.id}`, created_at: n.created_at, note: n })),
    ];
    return items.sort(byTime);
  }, [messages, notes]);

  const win = useMemo(() => windowInfo(messages), [messages]);

  return {
    conversation,
    setConversation,
    timeline,
    messages,
    reactions,
    loading,
    error,
    reload: load,
    hasEarlier,
    loadingEarlier,
    loadEarlier,
    send,
    retry,
    discard,
    addNote,
    deleteNote,
    window: win,
    pageSize: MESSAGES_PAGE,
  };
}
