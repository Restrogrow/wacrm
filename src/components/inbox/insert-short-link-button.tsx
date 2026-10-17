'use client';

// "Insert short link" for the inbox composer: pick one of the account's
// active short links and drop its URL into the message. Links are created
// under Settings → Short links.

import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface LinkItem {
  id: string;
  short_url: string;
  label: string;
  is_active: boolean;
}

export function InsertShortLinkButton({ onInsert, disabled }: { onInsert: (url: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/short-links', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      setLinks(((body?.links ?? []) as LinkItem[]).filter((l) => l.is_active));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void load();
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        title="Insert a short link"
        aria-label="Insert a short link"
        className="text-muted-foreground hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
      >
        <Link2 className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 p-2">
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 p-3 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </div>
        ) : !links || links.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">No short links yet. Create one under Settings → Short links.</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto">
            {links.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="hover:bg-muted w-full rounded-md px-2 py-1.5 text-left"
                  onClick={() => {
                    onInsert(l.short_url);
                    setOpen(false);
                  }}
                >
                  <span className="text-foreground block truncate text-xs font-medium">{l.label || l.short_url}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">{l.short_url}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
