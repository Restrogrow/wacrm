'use client';

// ============================================================
// ConnectedAppsSettings — Settings → Connected apps
//
// Apps connected through "Connect RepeatGrow" (e.g. RestroGrow) hold
// an API key minted at POST /api/v1/connect/token, marked with a
// `client_id`. They're listed here instead of under API keys. Any
// member sees the list; admin+ can Disconnect, which revokes the key
// (same admin-only revoke route + RLS as the API keys panel).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plug, Unplug } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RequireRole } from '@/components/auth/require-role';
import { SCOPE_DESCRIPTIONS, isApiScope } from '@/lib/api-keys/scopes';
import { SettingsPanelHead } from './settings-panel-head';

interface ConnectedKey {
  id: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  client_id: string | null;
  created_by_name: string | null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ConnectedAppsSettings() {
  const [apps, setApps] = useState<ConnectedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/api-keys', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to load connected apps');
        return;
      }
      const data = (await res.json()) as { keys: ConnectedKey[] };
      setApps(data.keys.filter((k) => k.client_id));
    } catch (err) {
      console.error('[ConnectedAppsSettings] load error:', err);
      toast.error('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDisconnect(app: ConnectedKey) {
    setDisconnecting(app.id);
    try {
      const res = await fetch(`/api/account/api-keys/${app.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to disconnect');
        return;
      }
      toast.success(`Disconnected "${app.name}"`);
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, revoked_at: new Date().toISOString() } : a))
      );
    } catch (err) {
      console.error('[ConnectedAppsSettings] disconnect error:', err);
      toast.error('Could not reach the server');
    } finally {
      setDisconnecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  const active = apps.filter((a) => !a.revoked_at);
  const disconnected = apps.filter((a) => a.revoked_at);

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        icon={Plug}
        title="Connected apps"
        description="Apps you've connected to Repeat Grow, such as RestroGrow. They can only do what you allowed when connecting. Disconnect one to cut off its access immediately."
      />

      {active.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Plug className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">No apps connected.</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Use the &ldquo;Connect RepeatGrow&rdquo; button inside an app like RestroGrow to connect it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-border divide-y">
              {active.map((app) => (
                <li
                  key={app.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground truncate text-sm font-medium">{app.name}</span>
                      <Badge className="border-primary/40 bg-primary/10 text-primary text-[10px] tracking-wide uppercase">
                        Connected
                      </Badge>
                    </div>
                    <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
                      {app.scopes.map((s) => (
                        <li key={s}>• {isApiScope(s) ? SCOPE_DESCRIPTIONS[s] : s}</li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      Connected {fmtDate(app.created_at)}
                      {app.created_by_name ? ` by ${app.created_by_name}` : ''}
                      {' · '}
                      {app.last_used_at ? `last used ${fmtDate(app.last_used_at)}` : 'not used yet'}
                    </p>
                  </div>
                  <RequireRole min="admin">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(app)}
                      disabled={disconnecting === app.id}
                      className="self-start border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-700 dark:hover:text-red-200 sm:self-auto"
                    >
                      {disconnecting === app.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Unplug className="size-4" />
                      )}
                      Disconnect
                    </Button>
                  </RequireRole>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {disconnected.length > 0 ? (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Previously connected
          </p>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-border divide-y">
                {disconnected.map((app) => (
                  <li key={app.id} className="px-4 py-3">
                    <span className="text-muted-foreground text-sm line-through">{app.name}</span>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Connected {fmtDate(app.created_at)}
                      {app.created_by_name ? ` by ${app.created_by_name}` : ''} · disconnected{' '}
                      {fmtDate(app.revoked_at as string)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </section>
  );
}
