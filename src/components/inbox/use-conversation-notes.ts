"use client";

// Internal notes for the open conversation (table conversation_notes,
// migration 067): initial fetch, live INSERT/DELETE over realtime, and a
// refetch when the inbox resyncs. If the table is not there yet (migration
// not applied) this quietly returns no notes instead of breaking the thread.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ConversationNote {
  id: string;
  conversation_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

const NOTE_COLUMNS = "id, conversation_id, author_id, body, mentions, created_at";

export function useConversationNotes(conversationId: string | undefined, resyncToken = 0) {
  const [notes, setNotes] = useState<ConversationNote[]>([]);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("conversation_notes")
      .select(NOTE_COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Most likely migration 067 is not applied yet.
          setNotes([]);
          return;
        }
        setNotes((data as ConversationNote[]) ?? []);
      });

    const channel = supabase
      .channel(`notes:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_notes", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ConversationNote;
          setNotes((prev) => (prev.some((n) => n.id === row.id) ? prev : [...prev, row]));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "conversation_notes", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const old = payload.old as Partial<ConversationNote>;
          if (!old?.id) return;
          setNotes((prev) => prev.filter((n) => n.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId, resyncToken]);

  /** Add a note right away (the realtime echo is de-duplicated by id). */
  const addNote = useCallback((note: ConversationNote) => {
    setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
  }, []);

  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Notes of a previously open chat are hidden until the new fetch lands.
  const current = notes.filter((n) => n.conversation_id === conversationId);

  return { notes: current, addNote, removeNote };
}
