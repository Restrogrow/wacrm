'use client';

// Small badge in the chat header showing the customer's satisfaction rating
// for this conversation ("Rated Great"), or "Rating requested" while we wait.
// Reads csat_responses through the signed-in user's access rules; renders
// nothing when there is no survey or the table does not exist yet.

import { useEffect, useState } from 'react';
import { Smile } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { CSAT_LABELS, type CsatRating } from '@/lib/csat/core';
import { cn } from '@/lib/utils';

const TONE: Record<CsatRating, string> = {
  3: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  2: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  1: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function CsatBadge({ conversationId, status }: { conversationId: string; status?: string }) {
  // Remember which chat + status the answer belongs to, so a stale one never shows.
  const [found, setFound] = useState<{ key: string; rating: number | null } | null>(null);
  const key = `${conversationId}|${status ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await createClient()
        .from('csat_responses')
        .select('rating')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (!cancelled) setFound(error || !data ? null : { key, rating: data.rating as number | null });
    })();
    return () => {
      cancelled = true;
    };
    // Re-check when the chat is closed/reopened, which is when a survey goes out.
  }, [conversationId, status, key]);

  if (!found || found.key !== key) return null;
  const rating = found.rating;
  if (rating === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        <Smile className="h-3 w-3" /> Rating requested
      </span>
    );
  }
  const r = rating as CsatRating;
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[r])}
      title="Customer satisfaction rating for this chat"
    >
      <Smile className="h-3 w-3" /> Rated {CSAT_LABELS[r]}
    </span>
  );
}
