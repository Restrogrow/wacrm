import {
  Bot,
  Coins,
  CreditCard,
  Download,
  KeyRound,
  Mail,
  MessageSquareText,
  Palette,
  PlugZap,
  Shield,
  Tags,
  User,
  UsersRound,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { PageHero } from '@/components/layout/page-hero';

/**
 * Section header shown at the top of every settings panel — a title,
 * a one-line description, an optional icon and an optional right-aligned
 * action (e.g. "New template", "Invite member").
 */
const TITLE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'Your profile': User,
  'Login & security': Shield,
  Appearance: Palette,
  'Your data': Download,
  'WhatsApp connection': PlugZap,
  'Saved replies': MessageSquareText,
  'Fields & tags': Tags,
  'Deals & currency': Coins,
  'Team members': UsersRound,
  'API keys': KeyRound,
  'Plan & billing': CreditCard,
  'Daily summary': Mail,
  'AI chatbot': Bot,
};

export function SettingsPanelHead({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <PageHero
      icon={icon ?? TITLE_ICONS[title]}
      title={title}
      description={description}
      action={action}
      className={className ? `mb-5 ${className}` : 'mb-5'}
    />
  );
}
