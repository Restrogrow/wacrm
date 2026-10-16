'use client';

// "Call" button in the chat header. Checks the customer's call
// permission first; without it, offers to send a WhatsApp call
// permission request (the customer taps Allow in WhatsApp).

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useCalls } from './call-provider';

const DEFAULT_TEXT = 'We would like to call you on WhatsApp about your enquiry. Is that okay?';

interface PermissionInfo {
  status: 'no_permission' | 'temporary' | 'permanent';
  can_call: boolean;
  can_request: boolean;
}

export function CallButton({ conversationId, label }: { conversationId: string; label: string }) {
  const { canSendMessages } = useAuth();
  const { supported, active, startCall } = useCalls();
  const [checking, setChecking] = useState(false);
  const [dialog, setDialog] = useState<{ canRequest: boolean; reason: string } | null>(null);
  const [text, setText] = useState(DEFAULT_TEXT);
  const [sending, setSending] = useState(false);

  if (!canSendMessages || !supported) return null;

  async function placeCall() {
    const result = await startCall(conversationId, label);
    if (!result.ok) {
      if (result.needsPermission) setDialog({ canRequest: true, reason: result.error });
      else toast.error(result.error);
    }
  }

  async function handleClick() {
    setChecking(true);
    try {
      const res = await fetch(`/api/whatsapp/calls/permission?conversation_id=${conversationId}`);
      const body = (await res.json().catch(() => null)) as (PermissionInfo & { error?: string }) | null;
      if (!res.ok || !body) {
        toast.error(body?.error ?? 'Could not check call permission.');
        return;
      }
      if (body.can_call) {
        await placeCall();
        return;
      }
      setText(DEFAULT_TEXT);
      setDialog({
        canRequest: body.can_request,
        reason:
          body.status === 'no_permission'
            ? 'This customer hasn’t allowed calls from your business yet.'
            : 'You’ve reached WhatsApp’s call limit for this customer for now.',
      });
    } finally {
      setChecking(false);
    }
  }

  async function sendRequest() {
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/calls/permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not send the request.');
        return;
      }
      toast.success('Permission request sent. You can call once they tap Allow.');
      setDialog(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={checking || !!active}
        aria-label="Call on WhatsApp"
        title={active ? 'You’re already on a call' : 'Call on WhatsApp'}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
      >
        {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
      </button>

      <Dialog open={dialog !== null} onOpenChange={(open) => !sending && !open && setDialog(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Ask to call {label}?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {dialog?.reason}{' '}
              {dialog?.canRequest
                ? 'Send a request in WhatsApp — once they tap Allow, you can call them. Customers who call you allow call-backs automatically.'
                : 'WhatsApp allows one request a day and two a week per customer. Try again later, or ask them to call you.'}
            </DialogDescription>
          </DialogHeader>
          {dialog?.canRequest && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Message shown with the request</p>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1024} />
              <p className="text-xs text-muted-foreground">
                Needs an open 24-hour chat window (the customer messaged you in the last 24 hours).
              </p>
            </div>
          )}
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={sending}>
              Close
            </Button>
            {dialog?.canRequest && (
              <Button onClick={sendRequest} disabled={sending || !text.trim()}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
                Send request
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
