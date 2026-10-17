'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

import { RequireRole } from '@/components/auth/require-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS } from '@/lib/audit-core';
import { SettingsPanelHead } from './settings-panel-head';

interface Entry {
  id: string
  created_at: string
  actor_name: string
  actor_user_id: string | null
  action: string
  action_label: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  ip: string | null
}

const PAGE_SIZE = 25;

function describe(e: Entry): string {
  const m = e.metadata ?? {};
  const bits: string[] = [];
  if (typeof m.newRole === 'string') bits.push(`new role: ${m.newRole}`);
  if (typeof m.role === 'string') bits.push(`role: ${m.role}`);
  if (typeof m.email === 'string' && m.email) bits.push(String(m.email));
  if (typeof m.name === 'string') bits.push(String(m.name));
  if (typeof m.plan === 'string') bits.push(`plan: ${m.plan}`);
  if (typeof m.count === 'number') bits.push(`${m.count} contacts`);
  if (e.target_type === 'integration' && e.target_id) bits.push(e.target_id.replace('_', ' '));
  return bits.join(' · ');
}

/**
 * Settings > Activity log: who did what (team changes, API keys, integrations,
 * plan edits, 2FA…), newest first. Owners and admins only; the API enforces it.
 */
export function ActivityLogPanel() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (action) p.set('action', action);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [action, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/account/audit-log?${qs({ page: String(page), pageSize: String(PAGE_SIZE) })}`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error || 'Could not load the activity log');
        setRows([]);
      } else {
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [qs, page]);

  function exportCsv() {
    // Plain navigation: the API answers with a CSV attachment for this account.
    const a = document.createElement('a');
    a.href = `/api/account/audit-log?${qs({ format: 'csv' })}`;
    a.download = 'activity-log.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('Preparing your CSV…');
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Activity log"
        description="A record of important changes in your workspace: who did what, and when. Only owners and admins can see it."
      />
      <RequireRole
        min="admin"
        fallback={<p className="text-muted-foreground text-sm">Only owners and admins can view the activity log.</p>}
      >
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Entries can&apos;t be edited or deleted. Passwords, keys and tokens are never stored here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="al-action" className="text-xs">
                  What happened
                </Label>
                <select
                  id="al-action"
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    setPage(1);
                  }}
                  className="border-border bg-background h-9 rounded-md border px-2 text-sm"
                >
                  <option value="">Everything</option>
                  {AUDIT_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {AUDIT_ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="al-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="al-from"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="al-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="al-to"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                  className="h-9"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto">
                <Download className="mr-1.5 size-3.5" /> Export CSV
              </Button>
            </div>

            {error && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{error}</p>}

            <div className="divide-border border-border divide-y overflow-hidden rounded-xl border">
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
              ) : rows.length === 0 && !error ? (
                <p className="text-muted-foreground p-8 text-center text-sm">Nothing here yet.</p>
              ) : (
                rows.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{e.action_label}</p>
                      <p className="text-muted-foreground text-xs">
                        by {e.actor_name}
                        {describe(e) ? ` · ${describe(e)}` : ''}
                      </p>
                    </div>
                    <div className="text-muted-foreground text-right text-xs">
                      <p>{new Date(e.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      {e.ip && <p>{e.ip}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {total} {total === 1 ? 'entry' : 'entries'}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="text-muted-foreground text-xs">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </RequireRole>
    </section>
  );
}
