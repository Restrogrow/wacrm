'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { BusinessDetailsCard } from '@/components/settings/business-details-card';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { CallingSettingsCard } from '@/components/settings/calling-settings-card';
import { NumberHealthCard } from '@/components/settings/number-health-card';
import { TemplateManager } from '@/components/settings/template-manager';
import { FormsSettings } from '@/components/settings/forms-settings';
import { SavedRepliesSettings } from '@/components/settings/saved-replies-settings';
import { QrLinkSettings } from '@/components/settings/qr-link-settings';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import { ConnectedAppsSettings } from '@/components/settings/connected-apps-settings';
import { AiChatbotSettings } from '@/components/settings/ai-chatbot-settings';
import { ShopifySettings } from '@/components/settings/shopify-settings';
import { CalendlySettings } from '@/components/settings/calendly-settings';
import { CommerceSettings } from '@/components/settings/commerce-settings';
import { BillingSettings } from '@/components/settings/billing-settings';
import { DailySummarySettings } from '@/components/settings/daily-summary-settings';
import { YourDataSettings } from '@/components/settings/your-data-settings';
import {
  resolveSection,
  type SettingsSection,
} from '@/components/settings/settings-sections';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency } = useAuth();
  const { mode } = useTheme();

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const section = resolveSection(searchParams.get('tab'));

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency],
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: (
      <div className="space-y-6">
        <ProfileForm />
        <BusinessDetailsCard />
      </div>
    ),
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    'your-data': <YourDataSettings />,
    whatsapp: (
      <div className="space-y-6">
        <WhatsAppConfig />
        <NumberHealthCard />
        <CallingSettingsCard />
      </div>
    ),
    'ai-chatbot': <AiChatbotSettings />,
    templates: <TemplateManager />,
    forms: <FormsSettings />,
    'saved-replies': <SavedRepliesSettings />,
    'qr-link': <QrLinkSettings />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
    'connected-apps': <ConnectedAppsSettings />,
    shopify: <ShopifySettings />,
    calendly: <CalendlySettings />,
    commerce: <CommerceSettings />,
    billing: <BillingSettings />,
    'daily-summary': <DailySummarySettings />,
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything in one place — your account and your workspace. Pick a
          section to manage it.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start">
        <SettingsRail active={section} onSelect={go} hints={hints} />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
