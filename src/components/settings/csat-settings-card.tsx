'use client';

// Settings → Saved replies → "Ask for a rating when a chat is closed".
// Admins switch CSAT on and set the wording. When an agent (or an automation)
// closes a chat inside the customer's 24-hour window, the customer gets three
// buttons (Great / Okay / Bad) and the answer is saved against the chat.
// API: /api/csat/settings.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Smile } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { CSAT_DEFAULT_MESSAGE, CSAT_MAX_MESSAGE_LENGTH, CSAT_OPTIONS } from '@/lib/csat/core';

export function CsatSettingsCard() {
  const { canEditSettings } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(CSAT_DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    fetch('/api/csat/settings')
      .then((r) => r.json())
      .then((s) => {
        if (off) return;
        setAvailable(s.available !== false);
        setEnabled(!!s.enabled);
        setMessage(s.message_text || CSAT_DEFAULT_MESSAGE);
        setLoaded(true);
      })
      .catch(() => !off && setLoaded(true));
    return () => {
      off = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/csat/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, message_text: message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save');
      toast.success('Rating request saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 rounded-3xl border-border">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Smile className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold">Ask for a rating when a chat is closed</h3>
              <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                The customer gets three buttons and the answer is saved on the chat and in Reports. Sent once per chat,
                only inside their 24-hour reply window.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEditSettings || !loaded || !available} />
        </div>

        {!available && loaded && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            Not set up yet. Ask your admin to finish the latest database update.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="csat-message" className="text-xs font-semibold text-muted-foreground">
            Message
          </Label>
          <Textarea
            id="csat-message"
            value={message}
            maxLength={CSAT_MAX_MESSAGE_LENGTH}
            rows={3}
            disabled={!canEditSettings || !available}
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-xl"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            {CSAT_OPTIONS.map((o) => (
              <span key={o.rating} className="rounded-full border border-border px-3 py-1 text-xs">
                {o.title}
              </span>
            ))}
          </div>
        </div>

        {canEditSettings ? (
          <Button onClick={() => void save()} disabled={busy || !loaded || !available} className="rounded-xl">
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can change this.</p>
        )}
      </CardContent>
    </Card>
  );
}
