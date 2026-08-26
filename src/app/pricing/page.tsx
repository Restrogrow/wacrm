import type { Metadata } from "next";
import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import { LANDING_NAV_HTML, LANDING_FOOTER_HTML } from "@/lib/landing-chrome";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Repeat Grow pricing — Starter, Growth, and Enterprise plans for WhatsApp CRM teams. Published pricing, no hidden fees, WhatsApp Business API setup included on every plan.",
  robots: {
    index: true,
    follow: true,
  },
};

const PRICING_BODY_HTML = `
<main id="top">

<header class="hero pricing-hero">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Pricing</span>
      <h1>Pricing that fits your business</h1>
      <p>Simple, published plans that scale with your contacts and team. No hidden fees. We handle WhatsApp Business API setup on every plan.</p>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="pricing-toggle reveal" role="group" aria-label="Billing cycle">
      <button type="button" class="cycle-btn is-active" data-cycle="monthly" aria-pressed="true">Monthly</button>
      <button type="button" class="cycle-btn" data-cycle="yearly" aria-pressed="false">Yearly <span class="save-badge">Save 10%</span></button>
    </div>

    <div class="pricing-grid-3 reveal" data-cycle-panel="monthly">
      <div class="price-card">
        <span class="plan-name mono">Starter</span>
        <h3>&#8377;499<small>/month</small></h3>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For a single team getting started with WhatsApp support and sales.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Shared inbox on the official WhatsApp Business API</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Sales pipelines &amp; broadcasts with Meta-approved templates</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Public REST API &amp; webhook access</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Self-service support + docs</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>2,000</b></li>
          <li>Broadcasts/month<b>60</b></li>
          <li>Automation flows<b>5</b></li>
          <li>Custom fields<b>5</b></li>
          <li>Team members<b>5</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Starter%20plan%20(monthly)" class="btn btn-ghost">Choose Starter</a>
      </div>
      <div class="price-card featured">
        <span class="plan-name mono">Growth</span>
        <h3>&#8377;999<small>/month</small></h3>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For growing teams running more campaigns with more people on the inbox.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Everything in Starter</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>No-code automation flows with branches &amp; webhooks</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Real-time dashboard &amp; activity feed</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Priority support (24&ndash;48 hrs)</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>50,000</b></li>
          <li>Broadcasts/month<b>250</b></li>
          <li>Automation flows<b>25</b></li>
          <li>Custom fields<b>25</b></li>
          <li>Team members<b>25</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Growth%20plan%20(monthly)" class="btn btn-primary">Choose Growth</a>
      </div>
      <div class="price-card">
        <span class="plan-name mono">Enterprise</span>
        <h3>&#8377;1,999<small>/month</small></h3>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For larger teams that need no caps and hands-on setup.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Everything in Growth</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Dedicated onboarding &amp; training</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Standard support + Business Manager setup</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Call + WhatsApp team support</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>Unlimited</b></li>
          <li>Broadcasts/month<b>Unlimited</b></li>
          <li>Automation flows<b>Unlimited</b></li>
          <li>Custom fields<b>Unlimited</b></li>
          <li>Team members<b>Unlimited</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Enterprise%20plan%20(monthly)" class="btn btn-ghost">Choose Enterprise</a>
      </div>
    </div>

    <div class="pricing-grid-3" data-cycle-panel="yearly" hidden>
      <div class="price-card">
        <span class="plan-name mono">Starter</span>
        <h3>&#8377;5,389<small>/year</small></h3>
        <p class="price-period"><span class="save">Save 10%</span> &middot; &#8776; &#8377;449/month</p>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For a single team getting started with WhatsApp support and sales.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Shared inbox on the official WhatsApp Business API</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Sales pipelines &amp; broadcasts with Meta-approved templates</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Public REST API &amp; webhook access</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Self-service support + docs</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>2,000</b></li>
          <li>Broadcasts/month<b>60</b></li>
          <li>Automation flows<b>5</b></li>
          <li>Custom fields<b>5</b></li>
          <li>Team members<b>5</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Starter%20plan%20(yearly)" class="btn btn-ghost">Choose Starter</a>
      </div>
      <div class="price-card featured">
        <span class="plan-name mono">Growth</span>
        <h3>&#8377;10,789<small>/year</small></h3>
        <p class="price-period"><span class="save">Save 10%</span> &middot; &#8776; &#8377;899/month</p>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For growing teams running more campaigns with more people on the inbox.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Everything in Starter</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>No-code automation flows with branches &amp; webhooks</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Real-time dashboard &amp; activity feed</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Priority support (24&ndash;48 hrs)</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>50,000</b></li>
          <li>Broadcasts/month<b>250</b></li>
          <li>Automation flows<b>25</b></li>
          <li>Custom fields<b>25</b></li>
          <li>Team members<b>25</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Growth%20plan%20(yearly)" class="btn btn-primary">Choose Growth</a>
      </div>
      <div class="price-card">
        <span class="plan-name mono">Enterprise</span>
        <h3>&#8377;21,589<small>/year</small></h3>
        <p class="price-period"><span class="save">Save 10%</span> &middot; &#8776; &#8377;1,799/month</p>
        <p class="price-note">+ WhatsApp per-conversation fees billed by Meta</p>
        <p class="desc">For larger teams that need no caps and hands-on setup.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Everything in Growth</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Dedicated onboarding &amp; training</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Standard support + Business Manager setup</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Call + WhatsApp team support</li>
        </ul>
        <ul class="limits">
          <li>Contacts import/export<b>Unlimited</b></li>
          <li>Broadcasts/month<b>Unlimited</b></li>
          <li>Automation flows<b>Unlimited</b></li>
          <li>Custom fields<b>Unlimited</b></li>
          <li>Team members<b>Unlimited</b></li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Enterprise%20plan%20(yearly)" class="btn btn-ghost">Choose Enterprise</a>
      </div>
    </div>

    <p class="how-caption" style="margin-top:32px;">Need something bigger, or a self-hosted deployment? <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20-%20Custom%20plan" style="color:var(--accent);">Email us</a> and we'll scope a custom plan.</p>
  </div>
</section>

<section class="cta-band">
  <div class="container">
    <span class="eyebrow" style="justify-content:center;">Not sure which plan fits?</span>
    <h2 style="margin-top:18px;">Message us and we'll help you pick.</h2>
    <p>Tell us about your team and WhatsApp volume — we'll point you at the right plan or start your free trial.</p>
    <div class="hero-ctas">
      <a href="/signup" class="btn btn-primary">Start Free Trial</a>
      <a href="https://wa.me/916377568749" target="_blank" rel="noopener" class="btn btn-ghost">Message us on WhatsApp</a>
    </div>
  </div>
</section>

</main>
`;

export default function PricingPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div
        className="lp-page"
        dangerouslySetInnerHTML={{
          __html: LANDING_NAV_HTML + PRICING_BODY_HTML + LANDING_FOOTER_HTML,
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
