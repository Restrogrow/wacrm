'use client';

// AI call notes, shown on the Calls page and in the contact panel.

import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { CallNotes } from '@/lib/ai/call-notes';

const MOOD: Record<CallNotes['mood'], { text: string; className: string }> = {
  happy: { text: 'Happy', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  neutral: { text: 'Neutral', className: 'bg-muted text-muted-foreground' },
  unhappy: { text: 'Unhappy', className: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

export function CallNotesView({ notes, compact = false }: { notes: CallNotes; compact?: boolean }) {
  const mood = MOOD[notes.mood] ?? MOOD.neutral;
  return (
    <div className={cn('space-y-3 text-sm', compact && 'space-y-2 text-xs')}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-primary">
          <Sparkles className="size-3.5" />
          AI call notes
        </span>
        <span className={cn('rounded-full px-2 py-0.5 font-medium', mood.className)}>{mood.text}</span>
        {notes.customer_language && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{notes.customer_language}</span>
        )}
      </div>
      <p className="leading-relaxed text-foreground">{notes.summary}</p>
      {notes.customer_wants && (
        <p className="text-foreground">
          <span className="font-semibold">Customer wants: </span>
          {notes.customer_wants}
        </p>
      )}
      {notes.action_items?.length > 0 && (
        <div>
          <p className="font-semibold text-foreground">To do</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">
            {notes.action_items.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {notes.follow_up && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-foreground">
          <span className="font-semibold">Follow up: </span>
          {notes.follow_up}
        </p>
      )}
    </div>
  );
}
