'use client';

// Share icon in the chat header: export just THIS conversation as a plain-
// text transcript — copy it, download it, or hand it to WhatsApp / email /
// the device share sheet. Everything happens in the browser from the
// messages already on screen; nothing is uploaded and no public link exists.

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Copy, Download, Mail, MessageCircle, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

// wa.me / mailto links break on very long text, so those two hand off a
// trimmed version; copy and download always carry the full transcript.
const LINK_TEXT_LIMIT = 1800;

function describe(message: Message): string {
  const text = message.content_text?.trim();
  switch (message.content_type) {
    case 'text':
      return text || '';
    case 'image':
      return text ? `[Image] ${text}` : '[Image]';
    case 'video':
      return text ? `[Video] ${text}` : '[Video]';
    case 'audio':
      return '[Voice message]';
    case 'document':
      return text ? `[Document] ${text}` : '[Document]';
    case 'location':
      return '[Location]';
    case 'template':
      return text || `[Template: ${message.template_name ?? 'message'}]`;
    default:
      return text || '';
  }
}

function buildTranscript(
  messages: Message[],
  opts: { contactName: string; contactPhone: string | null; withTimes: boolean },
): string {
  const header = [
    `Chat with ${opts.contactName}${opts.contactPhone ? ` (${opts.contactPhone})` : ''}`,
    `Exported ${format(new Date(), 'd MMM yyyy, h:mm a')} · ${messages.length} message${messages.length === 1 ? '' : 's'}`,
    '',
  ];
  const lines = messages
    .map((m) => {
      const body = describe(m);
      if (!body) return null;
      const who =
        m.sender_type === 'customer' ? opts.contactName : m.sender_type === 'bot' ? 'Bot' : 'Us';
      const when = opts.withTimes ? `[${format(new Date(m.created_at), 'd MMM, h:mm a')}] ` : '';
      return `${when}${who}: ${body}`;
    })
    .filter((l): l is string => l !== null);
  return [...header, ...lines].join('\n');
}

export function ShareChatButton({
  messages,
  contactName,
  contactPhone,
}: {
  messages: Message[];
  contactName: string;
  contactPhone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [withTimes, setWithTimes] = useState(true);

  const transcript = useMemo(
    () => buildTranscript(messages, { contactName, contactPhone, withTimes }),
    [messages, contactName, contactPhone, withTimes],
  );
  const empty = messages.length === 0;
  const linkText =
    transcript.length > LINK_TEXT_LIMIT
      ? `${transcript.slice(0, LINK_TEXT_LIMIT)}…\n(trimmed — download the full chat)`
      : transcript;

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcript);
      toast.success('Chat copied');
    } catch {
      toast.error('Copy failed — select the text and copy it manually');
    }
  }

  function download() {
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = contactName.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'chat';
    a.download = `chat-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `Chat with ${contactName}`, text: transcript });
    } catch {
      /* dismissed */
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={empty}
        aria-label="Share this chat"
        title="Share this chat"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-popover-foreground">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Share2 className="size-5" />
              </span>
              Share this chat
            </DialogTitle>
            <DialogDescription>
              Only this conversation with {contactName} — {messages.length} loaded message
              {messages.length === 1 ? '' : 's'}. Scroll up in the chat first to include older ones.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-2.5">
            <Label htmlFor="share-times" className="text-sm">
              Include date &amp; time on each message
            </Label>
            <Switch id="share-times" checked={withTimes} onCheckedChange={setWithTimes} />
          </div>

          <pre
            className={cn(
              'max-h-64 overflow-y-auto rounded-2xl border border-border bg-card-2 p-3.5 font-sans text-xs leading-relaxed whitespace-pre-wrap text-foreground',
            )}
          >
            {transcript}
          </pre>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void copy()} className="rounded-xl shadow-md shadow-primary/25">
              <Copy className="size-4" />
              Copy
            </Button>
            <Button variant="outline" onClick={download} className="rounded-xl">
              <Download className="size-4" />
              Download .txt
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              render={
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(linkText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              render={
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Chat with ${contactName}`)}&body=${encodeURIComponent(linkText)}`}
                />
              }
            >
              <Mail className="size-4" />
              Email
            </Button>
          </div>
          {canNativeShare && (
            <Button variant="ghost" onClick={() => void nativeShare()} className="rounded-xl">
              <Share2 className="size-4" />
              More options…
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
