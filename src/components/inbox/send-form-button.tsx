'use client';

// Clipboard icon in the chat header: pick a published WhatsApp form and
// send it to the customer (needs an open 24-hour window).
// API: /api/whatsapp/forms, /api/whatsapp/forms/[id]/send.

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface FormOption {
  id: string;
  name: string;
  title: string;
  status: string;
}

export function SendFormButton({ conversationId }: { conversationId: string }) {
  const { canSendMessages } = useAuth();
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<FormOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [cta, setCta] = useState('Open form');
  const [sending, setSending] = useState(false);

  if (!canSendMessages) return null;

  async function openDialog() {
    setOpen(true);
    const res = await fetch('/api/whatsapp/forms');
    const body = await res.json().catch(() => null);
    const live = ((body?.forms ?? []) as FormOption[]).filter((f) => f.status === 'published');
    setForms(live);
    if (live[0]) {
      setSelected(live[0].id);
      setText(`Please fill in this quick form: ${live[0].title}`);
    }
  }

  async function send() {
    if (!selected) return;
    setSending(true);
    try {
      const res = await fetch(`/api/whatsapp/forms/${selected}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, body: text, cta }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not send the form.');
        return;
      }
      toast.success('Form sent.');
      setOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openDialog()}
        aria-label="Send a WhatsApp form"
        title="Send a WhatsApp form"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ClipboardList className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => !sending && setOpen(v)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Send a form</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              The customer taps the button and fills it in inside WhatsApp. Answers appear in this chat.
            </DialogDescription>
          </DialogHeader>
          {!forms ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : forms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No live forms yet.{' '}
              <Link href="/settings?tab=forms" className="font-medium underline underline-offset-4">
                Create one
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {forms.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelected(f.id);
                      setText(`Please fill in this quick form: ${f.title}`);
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      selected === f.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1024} />
              </div>
              <div className="space-y-1.5">
                <Label>Button text</Label>
                <Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={30} />
              </div>
              <p className="text-xs text-muted-foreground">Works within 24 hours of the customer’s last message.</p>
            </div>
          )}
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={!selected || sending || !text.trim()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
