'use client';

// Clock button in the composer: "Send later". Schedules the text you typed for
// a chosen date and time (up to 30 days ahead) and lists the messages already
// waiting in this chat, with a cancel button. Times use this browser's time
// zone. The server sends the message from the every-minute cron.
// API: /api/scheduled-messages.

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Clock, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { MAX_LEAD_DAYS } from '@/lib/scheduled-messages/core';

interface Scheduled {
  id: string;
  content_text: string;
  scheduled_at: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  error_message: string | null;
}

/** "YYYY-MM-DDTHH:mm" in the browser's local time, as <input type="datetime-local"> wants. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function presets(): { label: string; at: Date }[] {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tomorrow9 = new Date(now);
  tomorrow9.setDate(tomorrow9.getDate() + 1);
  tomorrow9.setHours(9, 0, 0, 0);
  return [
    { label: 'In 1 hour', at: inOneHour },
    { label: 'Tomorrow 9 AM', at: tomorrow9 },
  ];
}

export function ScheduleMessageButton({
  conversationId,
  text,
  onScheduled,
}: {
  conversationId: string;
  /** The draft currently typed in the composer. */
  text: string;
  /** Called after a message is scheduled so the composer can clear its draft. */
  onScheduled: () => void;
}) {
  const { canSendMessages } = useAuth();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const [list, setList] = useState<Scheduled[]>([]);
  const [when, setWhen] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Earliest/latest pickable time, taken when the dialog opens (not during render).
  const [bounds, setBounds] = useState({ min: '', max: '' });

  if (!canSendMessages) return null;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function load() {
    const res = await fetch(`/api/scheduled-messages?conversation_id=${conversationId}`)
      .then((r) => r.json())
      .catch(() => null);
    setAvailable(res?.available !== false);
    setList(res?.messages ?? []);
  }

  function openDialog() {
    setOpen(true);
    setWarning(null);
    const now = Date.now();
    setBounds({
      min: toLocalInput(new Date(now + 60 * 1000)),
      max: toLocalInput(new Date(now + MAX_LEAD_DAYS * 24 * 60 * 60 * 1000)),
    });
    setWhen(toLocalInput(new Date(now + 60 * 60 * 1000)));
    void load();
  }

  async function schedule() {
    if (!when) return;
    setBusy(true);
    try {
      const res = await fetch('/api/scheduled-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          text,
          scheduled_at: new Date(when).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not schedule the message');
      toast.success(`Scheduled for ${formatWhen(json.message.scheduled_at)}`);
      setWarning(json.warning ?? null);
      onScheduled();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule the message');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/scheduled-messages/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Scheduled message cancelled');
      setList((l) => l.filter((m) => m.id !== id));
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error || 'Could not cancel');
      void load();
    }
  }

  const pendingCount = list.filter((m) => m.status === 'pending' || m.status === 'sending').length;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="Send later"
        aria-label="Send later"
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Clock className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" /> Send later
            </DialogTitle>
            <DialogDescription>
              Pick when to send the message you typed. Times are in your time zone ({tz}).
            </DialogDescription>
          </DialogHeader>

          {!available && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              Scheduling is not set up yet. Ask your admin to finish the latest database update.
            </p>
          )}

          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              {text.trim() ? (
                <p className="line-clamp-4 whitespace-pre-wrap">{text}</p>
              ) : (
                <p className="text-muted-foreground">Type your message in the composer first, then open this again.</p>
              )}
            </div>

            <div>
              <Label htmlFor="schedule-at" className="text-xs">
                Send at
              </Label>
              <Input
                id="schedule-at"
                type="datetime-local"
                value={when}
                min={bounds.min}
                max={bounds.max}
                onChange={(e) => setWhen(e.target.value)}
                className="mt-1"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {presets().map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setWhen(toLocalInput(p.at))}
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {warning && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>{warning}</span>
              </p>
            )}

            <Button
              onClick={() => void schedule()}
              disabled={busy || !text.trim() || !when || !available}
              className="w-full"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Schedule message
            </Button>
          </div>

          {list.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">
                In this chat{pendingCount ? ` (${pendingCount} waiting)` : ''}
              </p>
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {list.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 rounded-xl border border-border p-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 whitespace-pre-wrap">{m.content_text}</p>
                      <p
                        className={cn(
                          'mt-1',
                          m.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
                        )}
                      >
                        {m.status === 'failed'
                          ? `Failed: ${m.error_message ?? 'could not be sent'}`
                          : m.status === 'sending'
                            ? 'Sending now…'
                            : formatWhen(m.scheduled_at)}
                      </p>
                    </div>
                    {m.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void cancel(m.id)}
                        title="Cancel"
                        aria-label="Cancel scheduled message"
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
