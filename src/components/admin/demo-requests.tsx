'use client';

// Demo requests on /admin: who asked for a demo, with a WhatsApp link and a
// status you can change as you work through them. API:
// /api/admin/demo-requests/[id].

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  DEMO_STATUSES,
  DEMO_STATUS_LABELS,
  type DemoRequestRow,
  type DemoRequestsData,
  type DemoStatus,
} from '@/lib/admin/demo-requests';

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** wa.me needs digits only; a bare 10-digit number is treated as Indian. */
function whatsappLink(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}`;
}

const STATUS_STYLE: Record<DemoStatus, string> = {
  new: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  contacted: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  demo_done: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  won: 'bg-green-600/15 text-green-700 dark:text-green-400',
  lost: 'bg-muted text-muted-foreground',
};

export function DemoRequests({ data }: { data: DemoRequestsData }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DemoStatus | 'all'>('all');

  if (!data.available) {
    return (
      <p className="border-border text-muted-foreground rounded-xl border p-4 text-sm">
        Run migration <code>054_demo_requests.sql</code> to receive demo requests.
      </p>
    );
  }

  async function setStatus(row: DemoRequestRow, status: DemoStatus) {
    if (status === row.status) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/demo-requests/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? 'Could not update the status.');
        return;
      }
      toast.success(`Marked ${DEMO_STATUS_LABELS[status].toLowerCase()}.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const rows = filter === 'all' ? data.rows : data.rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {(['all', ...DEMO_STATUSES] as const).map((s) => {
          const count = s === 'all' ? data.rows.length : data.counts[s];
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 ${
                active ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'All' : DEMO_STATUS_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-xl border p-4 text-sm">
          {data.rows.length === 0 ? 'No demo requests yet.' : 'No requests with this status.'}
        </p>
      ) : (
        <div className="border-border divide-border divide-y rounded-xl border">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold">
                  {r.name} <span className="text-muted-foreground font-normal">from</span> {r.business_name}
                </p>
                <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                  <a
                    href={whatsappLink(r.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 underline dark:text-emerald-400"
                  >
                    WhatsApp {r.whatsapp}
                  </a>
                  {r.email && (
                    <a href={`mailto:${r.email}`} className="underline">
                      {r.email}
                    </a>
                  )}
                  {r.team_size && <span>Team: {r.team_size}</span>}
                  {r.use_case && <span>Interested in: {r.use_case}</span>}
                </p>
                {r.message && <p className="text-foreground/80 whitespace-pre-line">{r.message}</p>}
                <p className="text-muted-foreground text-xs">
                  {formatIst(r.created_at)}
                  {r.source_page ? ` · from ${r.source_page}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>
                  {DEMO_STATUS_LABELS[r.status]}
                </span>
                <select
                  aria-label={`Status for ${r.business_name}`}
                  value={r.status}
                  disabled={busyId === r.id}
                  onChange={(e) => setStatus(r, e.target.value as DemoStatus)}
                  className="border-border bg-background rounded-md border px-2 py-1 text-sm"
                >
                  {DEMO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {DEMO_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
