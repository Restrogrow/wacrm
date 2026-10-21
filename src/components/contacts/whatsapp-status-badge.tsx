'use client';

import { CircleCheck, CircleHelp, CircleX } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { WhatsAppStatus } from '@/lib/contacts/whatsapp-status';

const STYLES: Record<WhatsAppStatus, { label: string; title: string; className: string; Icon: typeof CircleCheck }> = {
  on: {
    label: 'On WhatsApp',
    title: 'Confirmed: this number has received or sent WhatsApp messages',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    Icon: CircleCheck,
  },
  off: {
    label: 'Not on WhatsApp',
    title: 'WhatsApp could not deliver to this number (Meta error 131026). It is likely not on WhatsApp.',
    className: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
    Icon: CircleX,
  },
  unknown: {
    label: 'WhatsApp not checked',
    title: "Not known yet: WhatsApp doesn't let businesses check a number in advance. This updates after the first message.",
    className: 'border-border bg-muted text-muted-foreground',
    Icon: CircleHelp,
  },
};

export function WhatsAppStatusBadge({
  status,
  compact = false,
  className,
}: {
  status: WhatsAppStatus | null | undefined;
  /** Icon only, for tight table rows. */
  compact?: boolean;
  className?: string;
}) {
  if (!status) return null;
  const { label, title, className: tone, Icon } = STYLES[status];
  return (
    <span
      title={title}
      aria-label={label}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
        tone,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </span>
  );
}
