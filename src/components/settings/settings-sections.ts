import {
  Bot,
  ClipboardList,
  CalendarCheck,
  Coins,
  CreditCard,
  Download,
  FileText,
  IndianRupee,
  KeyRound,
  LayoutGrid,
  Mail,
  MessageSquareText,
  Palette,
  Plug,
  PlugZap,
  QrCode,
  Shield,
  ShoppingBag,
  Tags,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'your-data',
  'whatsapp',
  'ai-chatbot',
  'templates',
  'forms',
  'saved-replies',
  'qr-link',
  'fields',
  'deals',
  'members',
  'api',
  'connected-apps',
  'shopify',
  'calendly',
  'commerce',
  'billing',
  'daily-summary',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace' | 'moved';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  'your-data': { id: 'your-data', label: 'Your data', icon: Download, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  'ai-chatbot': { id: 'ai-chatbot', label: 'AI chatbot', icon: Bot, group: 'moved' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'moved' },
  forms: { id: 'forms', label: 'WhatsApp forms', icon: ClipboardList, group: 'moved' },
  'saved-replies': { id: 'saved-replies', label: 'Saved replies', icon: MessageSquareText, group: 'workspace' },
  'qr-link': { id: 'qr-link', label: 'QR & WhatsApp link', icon: QrCode, group: 'moved' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
  'connected-apps': { id: 'connected-apps', label: 'Connected apps', icon: Plug, group: 'moved' },
  shopify: { id: 'shopify', label: 'Shopify', icon: ShoppingBag, group: 'moved' },
  calendly: { id: 'calendly', label: 'Calendly', icon: CalendarCheck, group: 'moved' },
  commerce: { id: 'commerce', label: 'Orders & payments', icon: IndianRupee, group: 'moved' },
  billing: { id: 'billing', label: 'Plan & billing', icon: CreditCard, group: 'workspace' },
  'daily-summary': { id: 'daily-summary', label: 'Daily summary', icon: Mail, group: 'moved' },
};

/**
 * Sections that graduated out of Settings into their own sidebar pages.
 * Old `?tab=` deep links (docs, banners, emails) still work: the
 * Settings page redirects them to the new route.
 */
export const MOVED_SECTION_ROUTES: Partial<Record<SettingsSection, string>> = {
  'ai-chatbot': '/ai-chatbot',
  forms: '/forms',
  commerce: '/orders',
  shopify: '/integrations/shopify',
  calendly: '/integrations/calendly',
  'connected-apps': '/integrations/apps',
  templates: '/templates',
  'qr-link': '/qr-link',
  'daily-summary': '/daily-summary',
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
