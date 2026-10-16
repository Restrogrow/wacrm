'use client';

// ============================================================
// GoogleSheetsSettings - /integrations/google-sheets
//
// Connect a Google account, pick (or create) a spreadsheet, and choose
// what to sync: new contacts and/or a WhatsApp message log.
// Any member can view; admin+ can connect, change and export.
// API: /api/integrations/google-sheets (see lib/google-sheets).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ExternalLink, FilePlus2, Link2, Loader2, MessageSquare, Sheet, Unplug, Upload, UsersRound, Zap } from 'lucide-react';

import { IconChip } from '@/components/icon-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequireRole } from '@/components/auth/require-role';
import { SettingsPanelHead } from './settings-panel-head';

interface Connection {
  google_email: string | null;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  spreadsheet_title: string | null;
  sync_contacts: boolean;
  sync_messages: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  rows_synced: number;
}

interface State {
  oauth_available: boolean;
  redirect_uri: string;
  connection: Connection | null;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ' +
        (checked ? 'bg-primary' : 'bg-muted')
      }
    >
      <span
        className={
          'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ' +
          (checked ? 'translate-x-5' : '')
        }
      />
    </button>
  );
}

export function GoogleSheetsSettings() {
  const params = useSearchParams();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [title, setTitle] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/google-sheets', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        return;
      }
      setError(null);
      setState(data as State);
    } catch {
      setError('Could not reach the server');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Result of the OAuth round-trip.
  useEffect(() => {
    const err = params.get('google_error');
    if (err) toast.error(err);
    if (params.get('google') === 'connected') toast.success('Google account connected. Now choose a spreadsheet.');
  }, [params]);

  async function call(key: string, url: string, init: RequestInit, ok: (d: Record<string, unknown>) => string | null) {
    setBusy(key);
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Something went wrong');
        return;
      }
      const msg = ok(data);
      if (msg) toast.success(msg);
      await load();
    } catch {
      toast.error('Could not reach the server');
    } finally {
      setBusy(null);
    }
  }

  const conn = state?.connection ?? null;

  const head = (
    <SettingsPanelHead
      icon={Sheet}
      title="Google Sheets"
      description="Send new contacts and WhatsApp messages to a Google Sheet automatically."
    />
  );

  if (error) {
    return (
      <section>
        {head}
        <Card>
          <CardContent className="flex items-start gap-3 pt-6 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      </section>
    );
  }
  if (!state) {
    return (
      <section>
        {head}
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      {head}

      {/* Step 1 - Google account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
            <IconChip icon={Link2} className="size-10 rounded-2xl" />
            <span className="flex items-center gap-2">
              1. Google account
              {conn && <Badge className="bg-primary text-primary-foreground">Connected</Badge>}
            </span>
          </CardTitle>
          <CardDescription>
            {conn
              ? `Connected as ${conn.google_email ?? 'your Google account'}.`
              : 'Sign in with Google and allow Repeat Grow to edit your spreadsheets.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!state.oauth_available ? (
            <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Google isn&apos;t configured on this server yet.</p>
              <p>
                Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to <code>.env.local</code>, restart, and register this redirect URI in Google Cloud:
              </p>
              <code className="block break-all rounded-lg bg-background/60 p-2 text-xs">{state.redirect_uri}</code>
            </div>
          ) : (
            <RequireRole min="admin" fallback={<p className="text-sm text-muted-foreground">Only admins can connect Google.</p>}>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => (window.location.href = '/api/integrations/google-sheets/install')}>
                  <Sheet className="size-4" />
                  {conn ? 'Reconnect Google' : 'Connect Google'}
                </Button>
                {conn &&
                  (confirmDisconnect ? (
                    <>
                      <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-red-600 text-white hover:bg-red-700"
                        disabled={busy === 'disconnect'}
                        onClick={() =>
                          call('disconnect', '/api/integrations/google-sheets', { method: 'DELETE' }, () => {
                            setConfirmDisconnect(false);
                            return 'Disconnected';
                          })
                        }
                      >
                        {busy === 'disconnect' ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                        Yes, disconnect
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setConfirmDisconnect(true)}>
                      <Unplug className="size-4" />
                      Disconnect
                    </Button>
                  ))}
              </div>
            </RequireRole>
          )}
        </CardContent>
      </Card>

      {/* Step 2 - spreadsheet */}
      {conn && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
              <IconChip icon={Sheet} className="size-10 rounded-2xl" />
              2. Spreadsheet
            </CardTitle>
            <CardDescription>
              Rows go to a <strong>Contacts</strong> tab and a <strong>Messages</strong> tab (created for you if missing).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {conn.spreadsheet_id && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-soft-2 bg-primary-soft p-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground">Syncing to</p>
                  <p className="truncate font-semibold text-foreground">{conn.spreadsheet_title}</p>
                </div>
                {conn.spreadsheet_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(conn.spreadsheet_url!, '_blank', 'noopener')}>
                    <ExternalLink className="size-3.5" />
                    Open sheet
                  </Button>
                )}
              </div>
            )}

            <RequireRole min="admin" fallback={null}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-2xl border border-border p-4">
                  <Label htmlFor="gs-title" className="text-muted-foreground">Create a new spreadsheet</Label>
                  <Input id="gs-title" placeholder="Repeat Grow - WhatsApp CRM" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Button
                    size="sm"
                    disabled={busy === 'create'}
                    onClick={() =>
                      call('create', '/api/integrations/google-sheets/sheet', { method: 'POST', body: JSON.stringify({ action: 'create', title }) }, () => 'Spreadsheet created')
                    }
                  >
                    {busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
                    Create
                  </Button>
                </div>
                <div className="space-y-2 rounded-2xl border border-border p-4">
                  <Label htmlFor="gs-url" className="text-muted-foreground">Or use an existing one (paste its link)</Label>
                  <Input id="gs-url" placeholder="https://docs.google.com/spreadsheets/d/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === 'link' || !linkUrl.trim()}
                    onClick={() =>
                      call('link', '/api/integrations/google-sheets/sheet', { method: 'POST', body: JSON.stringify({ action: 'link', url: linkUrl }) }, () => {
                        setLinkUrl('');
                        return 'Spreadsheet linked';
                      })
                    }
                  >
                    {busy === 'link' ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                    Use this sheet
                  </Button>
                </div>
              </div>
            </RequireRole>
          </CardContent>
        </Card>
      )}

      {/* Step 3 - what to sync */}
      {conn?.spreadsheet_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight text-foreground">
              <IconChip icon={Zap} className="size-10 rounded-2xl" />
              3. What to sync
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RequireRole
              min="admin"
              fallback={<p className="text-sm text-muted-foreground">Only admins can change sync settings.</p>}
            >
              {[
                { key: 'sync_contacts' as const, icon: UsersRound, label: 'New contacts', hint: 'Adds a row to the Contacts tab whenever someone new messages you.', value: conn.sync_contacts },
                { key: 'sync_messages' as const, icon: MessageSquare, label: 'Message log', hint: 'Adds a row to the Messages tab for every incoming WhatsApp message.', value: conn.sync_messages },
              ].map((o) => (
                <div key={o.key} className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <o.icon className="mt-0.5 size-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold text-foreground">{o.label}</p>
                      <p className="text-sm text-muted-foreground">{o.hint}</p>
                    </div>
                  </div>
                  <Toggle
                    checked={o.value}
                    disabled={busy === o.key}
                    onChange={(v) =>
                      call(o.key, '/api/integrations/google-sheets', { method: 'PATCH', body: JSON.stringify({ [o.key]: v }) }, () => null)
                    }
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="outline"
                  disabled={busy === 'export'}
                  onClick={() =>
                    call('export', '/api/integrations/google-sheets/export', { method: 'POST' }, (d) => `Exported ${d.count as number} contacts`)
                  }
                >
                  {busy === 'export' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Export all existing contacts
                </Button>
                <Button
                  variant="outline"
                  disabled={busy === 'test'}
                  onClick={() => call('test', '/api/integrations/google-sheets/test', { method: 'POST' }, () => 'Test row added to your sheet')}
                >
                  {busy === 'test' ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                  Send test row
                </Button>
              </div>
            </RequireRole>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" />
                {conn.rows_synced} rows synced
              </span>
              <span>Last sync: {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString() : 'none yet'}</span>
            </div>
            {conn.last_error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Last sync failed: {conn.last_error}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
