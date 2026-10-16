'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { THEMES } from '@/lib/themes';
import { CURRENCIES } from '@/lib/currency';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { SECTION_META, type SettingsSection } from './settings-sections';
import { SettingsChip, StatusDot } from './settings-chip';
import { ROLE_META } from './role-meta';

interface OverviewCounts {
  members: number | null;
  pendingInvites: number | null;
  templates: number | null;
  templatesPending: number | null;
  tags: number | null;
  customFields: number | null;
}

interface WhatsAppStatus {
  configured: boolean;
  connected: boolean;
}

export function SettingsOverview({
  onSelect,
}: {
  onSelect: (section: SettingsSection) => void;
}) {
  const { user, profile, accountId, accountRole, defaultCurrency, canManageMembers } =
    useAuth();
  const { mode, theme } = useTheme();

  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  // WhatsApp status is tracked separately: its health check decrypts the
  // token and pings Meta, which is far slower than the cheap count
  // queries. Gating it independently keeps a slow/flaky Meta round-trip
  // from blanking the rest of the landing.
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || !accountId) return;
    let cancelled = false;
    const supabase = createClient();
    const userId = user.id;
    const acctId = accountId;

    // Cheap counts — resolve fast, render immediately.
    (async () => {
      setCountsLoading(true);
      const [membersRes, invitesRes, templatesTotal, templatesPending, tagsRes, fieldsRes] =
        await Promise.allSettled([
          fetch('/api/account/members', { cache: 'no-store' }).then((r) => r.json()),
          canManageMembers
            ? fetch('/api/account/invitations', { cache: 'no-store' }).then((r) =>
                r.json(),
              )
            : Promise.resolve(null),
          supabase
            .from('message_templates')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase
            .from('message_templates')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'PENDING'),
          supabase
            .from('tags')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase.from('custom_fields').select('id', { count: 'exact', head: true }),
        ]);

      if (cancelled) return;

      const members =
        membersRes.status === 'fulfilled' && Array.isArray(membersRes.value?.members)
          ? membersRes.value.members.length
          : null;
      const pendingInvites =
        invitesRes.status === 'fulfilled' &&
        invitesRes.value &&
        Array.isArray(invitesRes.value.invitations)
          ? invitesRes.value.invitations.length
          : null;

      setCounts({
        members,
        pendingInvites,
        templates:
          templatesTotal.status === 'fulfilled'
            ? templatesTotal.value.count ?? null
            : null,
        templatesPending:
          templatesPending.status === 'fulfilled'
            ? templatesPending.value.count ?? null
            : null,
        tags: tagsRes.status === 'fulfilled' ? tagsRes.value.count ?? null : null,
        customFields:
          fieldsRes.status === 'fulfilled' ? fieldsRes.value.count ?? null : null,
      });
      setCountsLoading(false);
    })();

    // WhatsApp connection status — slower, independent.
    (async () => {
      setWhatsappLoading(true);
      const [row, health] = await Promise.allSettled([
        supabase
          .from('whatsapp_config')
          .select('phone_number_id')
          .eq('account_id', acctId)
          .maybeSingle(),
        fetch('/api/whatsapp/config', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (cancelled) return;
      setWhatsapp({
        configured: row.status === 'fulfilled' && !!row.value.data?.phone_number_id,
        connected: health.status === 'fulfilled' && !!health.value?.connected,
      });
      setWhatsappLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, accountId, canManageMembers]);

  const displayName = profile?.full_name || profile?.email || 'Your account';
  const initial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase();
  const roleMeta = accountRole ? ROLE_META[accountRole] : null;
  const RoleIcon = roleMeta?.icon;

  const currencyLabel =
    CURRENCIES.find((c) => c.code === defaultCurrency)?.label ?? defaultCurrency;
  const themeName = THEMES.find((t) => t.id === theme)?.name ?? theme;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Per-tile loading + subtitle. `null` counts render as a graceful
  // fallback so a single failed query never blanks a tile.
  const tiles: {
    section: SettingsSection;
    loading: boolean;
    subtitle: ReactNode;
  }[] = [
    {
      section: 'whatsapp',
      loading: whatsappLoading,
      subtitle: !whatsapp?.configured ? (
        'Not set up yet'
      ) : whatsapp.connected ? (
        <>
          <StatusDot tone="ok" /> Connected
        </>
      ) : (
        <>
          <StatusDot tone="muted" /> Needs reconnecting
        </>
      ),
    },
    {
      section: 'members',
      loading: countsLoading,
      subtitle:
        counts?.members == null
          ? 'View team members'
          : `${counts.members} member${counts.members === 1 ? '' : 's'}${
              counts.pendingInvites
                ? ` · ${counts.pendingInvites} pending invite${
                    counts.pendingInvites === 1 ? '' : 's'
                  }`
                : ''
            }`,
    },
    {
      section: 'templates',
      loading: countsLoading,
      subtitle:
        counts?.templates == null
          ? 'Manage message templates'
          : `${counts.templates} template${counts.templates === 1 ? '' : 's'}${
              counts.templatesPending
                ? ` · ${counts.templatesPending} pending review`
                : ''
            }`,
    },
    {
      section: 'deals',
      loading: false,
      subtitle: `${defaultCurrency} — ${currencyLabel}`,
    },
    {
      section: 'fields',
      loading: countsLoading,
      subtitle:
        counts?.tags == null && counts?.customFields == null
          ? 'Tags and custom fields'
          : `${counts?.tags ?? 0} tag${counts?.tags === 1 ? '' : 's'} · ${
              counts?.customFields ?? 0
            } custom field${counts?.customFields === 1 ? '' : 's'}`,
    },
    {
      section: 'appearance',
      loading: false,
      subtitle: `${cap(mode)} mode · ${themeName} accent`,
    },
  ];

  return (
    <section className="animate-in fade-in-50 duration-200">
      {/* Identity */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--rail)] via-primary to-emerald-400 p-6 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -top-16 -right-16 size-60 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Avatar size="lg" className="size-16 ring-4 ring-white/30">
            {profile?.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-white text-2xl font-bold text-[var(--rail)]">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white/75">Your workspace</p>
            <div className="truncate text-2xl font-bold tracking-tight">
              {displayName}
            </div>
            {profile?.email ? (
              <div className="truncate text-sm text-white/80">
                {profile.email}
              </div>
            ) : null}
          </div>
          {roleMeta && RoleIcon ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold backdrop-blur [&_svg]:size-4">
              <RoleIcon />
              {roleMeta.label}
            </span>
          ) : null}
        </div>
      </div>

      <h2 className="mt-7 mb-3 text-base font-bold tracking-tight text-foreground">
        Quick overview
      </h2>

      {/* Status tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ section, loading, subtitle }) => {
          const meta = SECTION_META[section];
          const Icon = meta.icon;
          return (
            <button
              key={section}
              type="button"
              onClick={() => onSelect(section)}
              className={cn(
                'group flex items-start gap-4 rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition-all',
                'hover:-translate-y-0.5 hover:border-primary-soft-2 hover:shadow-md',
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold tracking-tight text-foreground">
                  {meta.label}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {loading ? (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Loading…
                    </>
                  ) : (
                    subtitle
                  )}
                </span>
              </span>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
