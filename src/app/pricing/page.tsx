import type { Metadata } from "next";
import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import {
  LANDING_NAV_HTML,
  LANDING_FOOTER_HTML,
  LANDING_WHATSAPP_FLOAT_HTML,
} from "@/lib/landing-chrome";
import { BRAND_KEYWORDS, SITE_URL, buildBreadcrumbNode } from "@/lib/seo";
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  LIMIT_KEYS,
  PLANS,
  PLAN_INFO,
  PLAN_LIMITS,
  cycleSavingPercent,
  type BillingCycle,
  type PaidPlan,
} from "@/lib/billing/plans";

const PRICING_TITLE = "Pricing";
const PRICING_DESCRIPTION =
  "Repeat Grow pricing: Starter, Growth, Pro and Enterprise plans, billed monthly, quarterly or yearly. No hidden fees, WhatsApp API setup included.";

// Paid plans with a published price (Enterprise is custom).
const PRICING_PLANS = PLANS.flatMap((plan) => {
  const prices = PLAN_INFO[plan].prices;
  return prices ? [{ name: PLAN_INFO[plan].label, price: String(prices.monthly) }] : [];
});

const PRICING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    buildBreadcrumbNode([{ name: "Pricing", path: "/pricing" }]),
    {
      "@type": "Service",
      serviceType: "WhatsApp CRM software",
      name: "Repeat Grow",
      url: `${SITE_URL}/pricing`,
      provider: { "@type": "Organization", name: "Repeat Grow", url: SITE_URL },
      offers: PRICING_PLANS.map((plan) => ({
        "@type": "Offer",
        name: `${plan.name} plan`,
        url: `${SITE_URL}/pricing`,
        priceCurrency: "INR",
        price: plan.price,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceCurrency: "INR",
          price: plan.price,
          unitText: "MONTH",
        },
      })),
    },
  ],
};

export const metadata: Metadata = {
  title: PRICING_TITLE,
  description: PRICING_DESCRIPTION,
  keywords: BRAND_KEYWORDS,
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    type: "website",
    url: "/pricing",
    title: `${PRICING_TITLE} | Repeat Grow`,
    description: PRICING_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRICING_TITLE} | Repeat Grow`,
    description: PRICING_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};


const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';

const LIMIT_ROW_LABELS: Record<(typeof LIMIT_KEYS)[number], string> = {
  contacts: "Contacts",
  broadcasts_per_month: "Broadcasts/month",
  automation_flows: "Automations &amp; flows",
  custom_fields: "Custom fields",
  team_members: "Team members",
};

// Short, one-line points per plan. The numbers in the limits table are what
// the app enforces; the AI volumes here are not enforced yet.
const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  starter: [
    "Shared inbox, contacts &amp; broadcasts",
    "Templates &amp; basic automations",
    "AI assistant: suggest reply, summary, translate",
    "Shopify integration",
    "Docs + email support",
  ],
  growth: [
    "Everything in Starter",
    "Pipelines, journeys &amp; segments",
    "Catalog, orders &amp; payments",
    "AI chatbot: 3,000 replies / month",
    "WooCommerce, Razorpay, Shiprocket, Cal.com",
    "Priority support (24 hrs)",
  ],
  pro: [
    "Everything in Growth",
    "AI voice agent: 300 min / month",
    "AI chatbot: 15,000 replies / month",
    "Ad attribution &amp; reports",
    "REST API &amp; webhooks",
    "Priority support + onboarding call",
  ],
  enterprise: [
    "Everything in Pro",
    "Multiple WhatsApp numbers",
    "Custom AI chatbot &amp; voice volume",
    "Custom terms for brands &amp; agencies",
    "Dedicated account manager",
  ],
};

const PLAN_DESC: Record<PaidPlan, string> = {
  starter: "For a small shop with 1&ndash;3 people.",
  growth: "For growing D2C and sales teams.",
  pro: "For high-volume, AI-first teams.",
  enterprise: "For brands and agencies.",
};

const inr = (n: number) => n.toLocaleString("en-IN");

function priceCard(plan: PaidPlan, cycle: BillingCycle): string {
  const info = PLAN_INFO[plan];
  const featured = plan === "growth";
  const limits = PLAN_LIMITS[plan];
  const per = BILLING_CYCLE_LABELS[cycle];
  let priceHtml: string;
  let cta: string;
  if (info.prices) {
    const amount = info.prices[cycle];
    const saving = cycleSavingPercent(plan, cycle);
    const perMonth = Math.round(amount / per.months);
    priceHtml =
      `<h3>&#8377;${inr(amount)}<small>/${per.per}</small></h3>` +
      (saving
        ? `<p class="price-period"><span class="save">Save ${saving}%</span> &middot; &#8776; &#8377;${inr(perMonth)}/month</p>`
        : "") +
      `<p class="price-note">+ WhatsApp per-message fees billed by Meta</p>`;
    const subject = encodeURIComponent(`Repeat Grow - ${info.label} plan (${cycle})`);
    cta = `<a href="mailto:support@repeatgrow.com?subject=${subject}" class="btn ${featured ? "btn-primary" : "btn-ghost"}">Choose ${info.label}</a>`;
  } else {
    priceHtml =
      `<h3>Custom</h3><p class="price-period">Priced for your volume</p>` +
      `<p class="price-note">+ WhatsApp per-message fees billed by Meta</p>`;
    cta = `<a href="/demo" class="btn btn-ghost">Talk to sales</a>`;
  }
  const features = PLAN_FEATURES[plan].map((t) => `<li>${CHECK_SVG}${t}</li>`).join("");
  const limitRows = LIMIT_KEYS.map((k) => {
    const v = limits[k];
    return `<li>${LIMIT_ROW_LABELS[k]}<b>${v === null ? "Unlimited" : inr(v)}</b></li>`;
  }).join("");
  return `
      <div class="price-card${featured ? " featured" : ""}">
        <span class="plan-name mono">${info.label}</span>
        ${priceHtml}
        <p class="desc">${PLAN_DESC[plan]}</p>
        <ul class="limits">${limitRows}</ul>
        <ul class="price-list">${features}</ul>
        ${cta}
      </div>`;
}

const PRICING_GRID_HTML =
  `<div class="pricing-toggle reveal" role="group" aria-label="Billing cycle">` +
  BILLING_CYCLES.map((cycle, i) => {
    const saving = cycleSavingPercent("starter", cycle);
    return `<button type="button" class="cycle-btn${i === 0 ? " is-active" : ""}" data-cycle="${cycle}" aria-pressed="${i === 0}">${BILLING_CYCLE_LABELS[cycle].label}${saving ? ` <span class="save-badge">Save ${saving}%</span>` : ""}</button>`;
  }).join("") +
  `</div>` +
  BILLING_CYCLES.map(
    (cycle, i) =>
      `<div class="pricing-grid-3 pricing-grid-4${i === 0 ? " reveal" : ""}" data-cycle-panel="${cycle}"${i === 0 ? "" : " hidden"}>${PLANS.map((p) => priceCard(p, cycle)).join("")}</div>`
  ).join("");

// Four plans side by side, kept compact; scoped to this page.
const PRICING_CSS = `
.lp-page .pricing-hero{ padding: 72px 0 48px; }
.lp-page .pricing-hero .section-head{ margin-bottom: 0; }
.lp-page .pricing-hero + section{ padding-top: 48px; }
.lp-page .pricing-toggle{ margin-bottom: 32px; }
.lp-page .pricing-grid-4{ grid-template-columns: repeat(4, 1fr); gap: 18px; }
.lp-page .pricing-grid-4 .price-card{ padding: 28px 22px 24px; }
.lp-page .pricing-grid-4 .price-card h3{ margin-top: 10px; font-size: 2rem; }
.lp-page .pricing-grid-4 .price-card .desc{ margin-top: 10px; min-height: 3em; font-size: 14px; line-height: 1.5; }
.lp-page .pricing-grid-4 .price-card .limits{ margin-top: 18px; padding-top: 16px; gap: 7px; }
.lp-page .pricing-grid-4 .price-list{ margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); gap: 9px; flex: none; }
.lp-page .pricing-grid-4 .price-list li{ font-size: 13.5px; }
.lp-page .pricing-grid-4 .price-card .btn{ margin-top: auto; }
.lp-page .pricing-grid-4 .price-card .price-list{ margin-bottom: 22px; }
@media (max-width: 1100px){ .lp-page .pricing-grid-4{ grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px){ .lp-page .pricing-grid-4{ grid-template-columns: 1fr; } }
`;

const PRICING_BODY_HTML = `
<main id="top">

<header class="hero pricing-hero">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Pricing</span>
      <h1>Pricing that fits your business</h1>
      <p>Every new account gets a <b>7-day free trial</b> with Growth limits. Then pick the plan that fits: from a simple shared inbox up to AI agents that chat and call for you. No hidden fees. We handle WhatsApp Business API setup on every plan.</p>
    </div>
  </div>
</header>

<section>
  <div class="container">
    ${PRICING_GRID_HTML}

    <p class="how-caption" style="margin-top:32px;">Need something bigger, or a self-hosted deployment? <a href="mailto:support@repeatgrow.com?subject=Repeat%20Grow%20-%20Custom%20plan" style="color:var(--accent-deep);text-decoration:underline;text-underline-offset:3px;">Email us</a> and we'll scope a custom plan.</p>
  </div>
</section>

<section class="section-alt">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">What's inside</span>
      <h2>Everything your team needs on WhatsApp</h2>
      <p>Starter covers the inbox, broadcasts and the AI assistant. Growth adds sales tools and the AI chatbot, Pro adds the AI voice agent, and Enterprise is built around your volume.</p>
    </div>
    <div class="usecase-grid reveal">
      <div class="usecase-card">
        <h3>Inbox &amp; calling</h3>
        <p>Shared inbox, saved replies, voice notes, in-browser WhatsApp voice calls, an AI voice agent that calls leads and answers missed calls, AI call notes, and coexistence with the WhatsApp Business app.</p>
      </div>
      <div class="usecase-card">
        <h3>Sales &amp; payments</h3>
        <p>Pipelines, orders with WhatsApp Pay or UPI, catalog sharing and WhatsApp forms.</p>
      </div>
      <div class="usecase-card">
        <h3>Campaigns &amp; automation</h3>
        <p>Scheduled broadcasts, carousel templates, automations, chatbot flows and the AI chatbot.</p>
      </div>
      <div class="usecase-card">
        <h3>Integrations</h3>
        <p>Shopify, Calendly, Connect RepeatGrow, the public REST API and signed webhooks.</p>
      </div>
      <div class="usecase-card">
        <h3>Insights &amp; safety</h3>
        <p>Live dashboard, daily summary email, WhatsApp number health checks and opt-out handling.</p>
      </div>
      <div class="usecase-card">
        <h3>After the trial</h3>
        <p>If a trial or paid period ends, your account becomes read-only: messages still arrive, but sending pauses until you choose a plan. Plans are activated after UPI or bank transfer.</p>
      </div>
    </div>
  </div>
</section>

<section class="cta-band">
  <div class="container">
    <span class="eyebrow" style="justify-content:center;">Not sure which plan fits?</span>
    <h2 style="margin-top:18px;">Message us and we'll help you pick.</h2>
    <p>Tell us about your team and WhatsApp volume and we'll point you at the right plan or start your free trial.</p>
    <div class="hero-ctas">
      <a href="/demo" class="btn btn-primary">Book a demo</a>
      <a href="/signup" class="btn btn-ghost">Start free trial</a>
      <a href="https://wa.me/916377568749" target="_blank" rel="noopener" class="btn btn-ghost">Message us on WhatsApp</a>
    </div>
  </div>
</section>

</main>
`;

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(PRICING_STRUCTURED_DATA),
        }}
      />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + PRICING_CSS }} />
      <div
        className="lp-page"
        dangerouslySetInnerHTML={{
          __html:
            LANDING_NAV_HTML +
            PRICING_BODY_HTML +
            LANDING_FOOTER_HTML +
            LANDING_WHATSAPP_FLOAT_HTML,
        }}
      />
      <Script
        id="pricing-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT }}
      />
    </>
  );
}
