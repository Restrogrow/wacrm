'use client';

// Share icon in the chat header, two tabs:
//   • Assign & share — ASSIGN the chat to one agent (they own it) and,
//     separately, SHARE it with other teammates (they get a notification
//     and can open it, but it isn't assigned to them). No customer message
//     is sent.
//   • Export — this conversation as a plain-text transcript: copy it,
//     download it, or hand it to WhatsApp / email / the device share sheet.
//     Built in the browser from the messages on screen; no public link.

import { IconChip } from '@/components/icon-chip';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Check, Copy, Download, Eye, Loader2, Mail, MessageCircle, Share2, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import type { Message, Profile } from '@/types';

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
  opts: { contactName: string; contactPhone: string | null; withTimes: boolean }
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
        m.sender_type === 'customer'
          ? opts.contactName
          : m.sender_type === 'bot'
            ? 'Bot'
            : 'Us';
      const when = opts.withTimes
        ? `[${format(new Date(m.created_at), 'd MMM, h:mm a')}] `
        : '';
      return `${when}${who}: ${body}`;
    })
    .filter((l): l is string => l !== null);
  return [...header, ...lines].join('\n');
}

export function ShareChatButton({
  conversationId,
  messages,
  contactName,
  contactPhone,
  members,
  currentUserId,
  assignedAgentId,
  onAssign,
}: {
  conversationId: string;
  messages: Message[];
  contactName: string;
  contactPhone: string | null;
  members: Profile[];
  currentUserId: string | undefined;
  assignedAgentId: string | null;
  onAssign: (agentId: string | null) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'team' | 'export'>('team');
  const [withTimes, setWithTimes] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const shareable = members.filter((m) => m.user_id !== currentUserId);

  async function changeAssignee(value: string) {
    setAssigning(true);
    try {
      await onAssign(value === '' ? null : value);
    } finally {
      setAssigning(false);
    }
  }

  async function shareWithTeam() {
    if (picked.length === 0) return;
    setSharing(true);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${conversationId}/share`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: picked, note }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Could not share the chat.');
      const names = (json.names as string[]) ?? [];
      setSharedWith((prev) => Array.from(new Set([...prev, ...names])));
      toast.success(`Shared with ${names.join(', ')}`);
      setPicked([]);
      setNote('');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not share the chat.'
      );
    } finally {
      setSharing(false);
    }
  }

  const transcript = useMemo(
    () => buildTranscript(messages, { contactName, contactPhone, withTimes }),
    [messages, contactName, contactPhone, withTimes]
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
    const safeName =
      contactName.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'chat';
    a.download = `chat-${safeName}-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: `Chat with ${contactName}`,
        text: transcript,
      });
    } catch {
      /* dismissed */
    }
  }

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={empty}
        aria-label="Assign, share or export this chat"
        title="Assign, share or export this chat"
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
      >
        <Share2 className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-popover max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-3">
              <IconChip icon={Share2} className="size-10 rounded-2xl" />
              Assign &amp; share
            </DialogTitle>
            <DialogDescription>
              Chat with {contactName}. Assign it to one person, share it with
              others, or export it.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted grid grid-cols-2 gap-1 rounded-2xl p-1">
            {(
              [
                ['team', 'Assign & share'],
                ['export', 'Export'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  tab === id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'team' ? (
            <div className="space-y-5">
              {/* Assign */}
              <div className="border-border bg-card-2 space-y-2 rounded-2xl border p-4">
                <p className="text-foreground flex items-center gap-2 text-sm font-bold">
                  <UserCheck className="text-primary size-4" />
                  Assigned to
                </p>
                <p className="text-muted-foreground text-xs">
                  The owner of this chat. They get a notification and it shows
                  under their name.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={assignedAgentId ?? ''}
                    onChange={(e) => void changeAssignee(e.target.value)}
                    disabled={assigning}
                    className="border-border bg-card text-foreground focus:border-primary h-10 w-full rounded-xl border px-3 text-sm outline-none disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name || m.email}
                        {m.user_id === currentUserId ? ' (me)' : ''}
                      </option>
                    ))}
                  </select>
                  {assigning && (
                    <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
                  )}
                </div>
              </div>

              {/* Share */}
              <div className="border-border bg-card-2 space-y-3 rounded-2xl border p-4">
                <p className="text-foreground flex items-center gap-2 text-sm font-bold">
                  <Eye className="text-primary size-4" />
                  Also share with
                </p>
                <p className="text-muted-foreground text-xs">
                  They can see this chat and get a notification, but it stays
                  assigned to the person above.
                </p>
                {shareable.length === 0 ? (
                  <p className="bg-muted/60 text-muted-foreground rounded-xl px-3 py-3 text-xs">
                    No other teammates yet. Invite people in Settings → Team
                    members.
                  </p>
                ) : (
                  <ul className="max-h-44 space-y-1 overflow-y-auto">
                    {shareable.map((m) => {
                      const checked = picked.includes(m.user_id);
                      const isAssignee = m.user_id === assignedAgentId;
                      return (
                        <li key={m.user_id}>
                          <label
                            className={cn(
                              'hover:bg-primary-soft/60 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                              checked && 'bg-primary-soft'
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setPicked((prev) =>
                                  v === true
                                    ? [...prev, m.user_id]
                                    : prev.filter((x) => x !== m.user_id)
                                )
                              }
                            />
                            <span className="bg-primary-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                              {(m.full_name || m.email || '?')
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="text-foreground block truncate text-sm font-medium">
                                {m.full_name || m.email}
                              </span>
                              {m.account_role && (
                                <span className="text-muted-foreground block text-[11px] capitalize">
                                  {m.account_role}
                                  {isAssignee ? ' · assigned' : ''}
                                </span>
                              )}
                            </span>
                            {sharedWith.includes(m.full_name || m.email) && (
                              <span className="bg-primary-soft text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                <Check className="size-3" /> Shared
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  placeholder="Add a note for them (optional) — e.g. “Customer wants a refund, please check”"
                  rows={2}
                  className="text-sm"
                />
                <Button
                  onClick={() => void shareWithTeam()}
                  disabled={sharing || picked.length === 0}
                  className="shadow-primary/25 w-full rounded-xl shadow-md"
                >
                  {sharing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Share2 className="size-4" />
                  )}
                  Share with {picked.length || ''}{' '}
                  {picked.length === 1 ? 'person' : 'people'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs">
                {messages.length} loaded message
                {messages.length === 1 ? '' : 's'}. Scroll up in the chat first
                to include older ones.
              </p>
              <div className="bg-muted/50 flex items-center justify-between rounded-2xl px-4 py-2.5">
                <Label htmlFor="share-times" className="text-sm">
                  Include date &amp; time on each message
                </Label>
                <Switch
                  id="share-times"
                  checked={withTimes}
                  onCheckedChange={setWithTimes}
                />
              </div>

              <pre className="border-border bg-card-2 text-foreground max-h-56 overflow-y-auto rounded-2xl border p-3.5 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                {transcript}
              </pre>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => void copy()}
                  className="shadow-primary/25 rounded-xl shadow-md"
                >
                  <Copy className="size-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  onClick={download}
                  className="rounded-xl"
                >
                  <Download className="size-4" />
                  Download .txt
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  nativeButton={false}
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
                  nativeButton={false}
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
                <Button
                  variant="ghost"
                  onClick={() => void nativeShare()}
                  className="w-full rounded-xl"
                >
                  <Share2 className="size-4" />
                  More options…
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
