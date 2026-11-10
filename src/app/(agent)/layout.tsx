import type { Metadata } from 'next';

import { requirePartnerPortal } from '@/lib/partners/guard';
import { AgentShell } from './agent-shell';

// The agent portal, for approved partners. Separate route group from
// (dashboard) on purpose — see agent-shell.tsx for why a partner can't
// live inside the customer shell.
//
// noindex for the same reason as the authed app: /partners is the
// public, indexable page, this is the private one behind it.
export const metadata: Metadata = {
  title: 'Partner dashboard',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guards every page in the group: signed out → /login, not a partner
  // (or still pending / rejected) → /partners, which is where that
  // story is told.
  const partner = await requirePartnerPortal();

  return <AgentShell partnerName={partner.name}>{children}</AgentShell>;
}
