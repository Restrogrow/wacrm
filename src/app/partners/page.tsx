import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeIndianRupee, Link2, LineChart, Wallet } from 'lucide-react';

import { SiteLinks } from '@/components/marketing/site-links';
import { buildBreadcrumbSchema } from '@/lib/seo';
import { PartnerApplyForm } from '@/components/partners/partner-apply-form';
import {
  COMMISSION_MONTHS,
  DEFAULT_COMMISSION_RATE,
  MIN_PAYOUT,
  REFERRAL_COOKIE_DAYS,
  formatInr,
} from '@/lib/partners/program';

// Public, indexable landing page for the partner program — this is the
// front door. Anyone can read the terms and apply here without an
// account; approved partners get a login for /agent, which is a
// separate portal from the customer dashboard.

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: 'Partner Program', path: '/partners' },
]);

const DESCRIPTION = `Earn ${DEFAULT_COMMISSION_RATE}% recurring commission reselling Repeat Grow's WhatsApp CRM. For agencies, consultants and resellers in India. Apply free — no account needed.`;

export const metadata: Metadata = {
  title: 'Partner Program — earn recurring commission',
  description: DESCRIPTION,
  alternates: { canonical: '/partners' },
  openGraph: {
    type: 'website',
    url: '/partners',
    title: 'Partner Program | Repeat Grow',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const HOW = [
  {
    icon: Link2,
    title: 'Get your link',
    body: `Once approved you get a personal referral link. Anyone who signs up within ${REFERRAL_COOKIE_DAYS} days of opening it is tagged to you.`,
  },
  {
    icon: LineChart,
    title: 'Track your clients',
    body: 'Your partner dashboard shows every client you brought, what plan they are on, and what each one has earned you.',
  },
  {
    icon: BadgeIndianRupee,
    title: 'Earn on every payment',
    body: `You earn ${DEFAULT_COMMISSION_RATE}% of what each client pays, for their first ${COMMISSION_MONTHS} months — not just the first invoice.`,
  },
  {
    icon: Wallet,
    title: 'Get paid',
    body: `Payouts by UPI or bank transfer once you have ${formatInr(MIN_PAYOUT)} or more to collect.`,
  },
];

const FAQ = [
  {
    q: 'Do I need to be a Repeat Grow customer?',
    a: 'No. You need no account at all to apply. If we approve you, we create a partner login just for your dashboard — it does not give you a CRM account and you are not billed for anything.',
  },
  {
    q: 'Who is this for?',
    a: 'Digital marketing agencies, Shopify and WooCommerce consultants, POS and billing resellers, and anyone already advising Indian businesses on how they talk to customers.',
  },
  {
    q: 'What counts as my client?',
    a: `Anyone who signs up within ${REFERRAL_COOKIE_DAYS} days of opening your link. You can also ask us to attach a client you closed directly — tell us and we will tag the account to you.`,
  },
  {
    q: 'When do I get paid?',
    a: `Commission is added when your client pays. Once your unpaid balance reaches ${formatInr(MIN_PAYOUT)} we send it by UPI or bank transfer, and every payout is listed in your dashboard with its reference.`,
  },
  {
    q: 'Is the commission recurring?',
    a: `Yes, for ${COMMISSION_MONTHS} months per client. Every payment they make in that window earns you ${DEFAULT_COMMISSION_RATE}%.`,
  },
];

export default function PartnersPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }}
      />

      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to Repeat Grow
      </Link>

      <header className="mt-6">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          Partner program
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Earn {DEFAULT_COMMISSION_RATE}% recurring on every client you bring
        </h1>
        <p className="mt-4 text-base leading-relaxed text-foreground/90">
          Already advising Indian businesses? Put them on WhatsApp properly
          and earn {DEFAULT_COMMISSION_RATE}% of everything they pay for their
          first {COMMISSION_MONTHS} months. No fee to join, no targets, and
          you don&apos;t need a Repeat Grow account to apply.
        </p>
      </header>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {HOW.map((step) => (
          <div
            key={step.title}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <step.icon className="size-5" />
            </span>
            <h2 className="mt-3 text-base font-semibold text-foreground">
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        ))}
      </section>

      <section id="apply" className="mt-12 scroll-mt-8">
        <h2 className="text-xl font-bold tracking-tight">Apply</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Takes a minute. We review applications within 2 working days.
        </p>
        <PartnerApplyForm />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">
          Questions people ask
        </h2>
        <dl className="mt-4 space-y-5">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-sm font-semibold text-foreground">
                {item.q}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        Already a partner?{' '}
        <Link href="/agent" className="font-medium text-primary hover:underline">
          Open your dashboard
        </Link>
        .
      </p>

      <SiteLinks />
    </div>
  );
}
