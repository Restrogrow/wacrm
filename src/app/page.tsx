import type { Metadata } from "next";
import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import { LANDING_NAV_HTML, LANDING_FOOTER_HTML } from "@/lib/landing-chrome";

// This route renders the Repeat Grow marketing homepage. It was migrated
// from a standalone static HTML file (landing-page/index.html) so it can
// live at the real site root and share the app's build/deploy pipeline
// instead of being a separate artifact that has to be kept in sync by hand.
//
// The markup/CSS/script below are embedded as raw strings (via
// dangerouslySetInnerHTML) rather than converted to JSX. All CSS selectors
// are scoped under .lp-page so nothing here leaks into the dashboard app's
// Tailwind/shadcn styling (which shares this same document). CSS, script,
// and nav/footer chrome live in src/lib/landing-* so /pricing can reuse
// them without duplicating ~1000 lines.
export const metadata: Metadata = {
  title: {
    absolute: "Repeat Grow — WhatsApp CRM for sales & support teams.",
  },
  description:
    "Repeat Grow is a WhatsApp CRM built on the official WhatsApp Business API. Shared inbox, contacts, sales pipelines, broadcasts, and no-code automations — set up and supported for you.",
  // The root layout defaults every route to noindex/nofollow since this is
  // primarily a private CRM app. This is the one public marketing page, so
  // it opts back in to being indexed.
  robots: {
    index: true,
    follow: true,
  },
};


const LANDING_BODY_HTML = `

<main id="top">

<!-- ============================= HERO ============================= -->
<header class="hero">
  <div class="container">
    <div class="hero-copy">
      <span class="eyebrow">Official WhatsApp Business API &middot; Done-for-you setup</span>
      <h1>Turn one-time chats into <span class="accent-text">repeat</span> customers.</h1>
      <p class="hero-sub">Repeat Grow is a WhatsApp CRM for sales and support teams — shared inbox, contacts, sales pipelines, broadcasts, and no-code automations, built on the official WhatsApp Business API. We set it up for your business, so your team is selling on WhatsApp in days.</p>
      <div class="hero-ctas">
        <a href="/signup" class="btn btn-primary">Start Free Trial</a>
        <a href="https://wa.me/916377568749" target="_blank" rel="noopener" class="btn btn-ghost">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.8-.11-.41-.13-.94-.31-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.29.56-.36.75-.36l.53.01c.17.01.4-.06.62.48.24.58.81 2 .88 2.15.07.15.12.32.02.52-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.68-.17 1.36z"/></svg>
          Message us on WhatsApp
        </a>
      </div>
      <p class="hero-note">Free to start — no credit card required.</p>
      <div class="hero-meta">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Official WhatsApp Business API</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Managed setup &amp; onboarding</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Dedicated support</span>
      </div>
    </div>
  </div>
</header>

<!-- ============================= TRUST STRIP ============================= -->
<div class="trust-strip">
  <div class="container">
    <span class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>Official WhatsApp Business API</span>
    <span class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>Trusted by growing teams</span>
    <span class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l6-6-6-6M12 19h8"/></svg>Live in days, not months</span>
    <span class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Secure &amp; fully managed</span>
  </div>
</div>

<!-- ============================= FEATURES ============================= -->
<section id="features">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">What's inside</span>
      <h2>Everything a WhatsApp sales &amp; support team needs</h2>
      <p>One codebase covering the full loop — from first inbound message to closed deal — without stitching together three SaaS tools.</p>
    </div>

    <div class="feature-grid reveal">
      <article class="feature-card wide">
        <div>
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2 3h4l2-3h4"/><path d="M4 12l2-7h12l2 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6z"/></svg>
          </div>
          <h3>Shared inbox</h3>
          <p>Official WhatsApp Business API on one shared number. Multiple agents, per-conversation assignment, status, and internal notes.</p>
        </div>
        <div class="mini-inbox">
          <div class="mini-inbox-row"><div class="mini-avatar" style="background:#3ecf8e">RS</div><span class="who">Riya Shah</span><span class="mini-badge">Assigned</span></div>
          <div class="mini-inbox-row"><div class="mini-avatar" style="background:#e0b95a">AK</div><span class="who">Amit K.</span><span class="snip">Open</span></div>
          <div class="mini-inbox-row"><div class="mini-avatar" style="background:#5a9bd4">MN</div><span class="who">M. Naidu</span><span class="snip">Resolved</span></div>
        </div>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">02</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 12.5a2 2 0 0 0 0-1L19 8.4a2 2 0 0 0-1.8-1.1H6.8A2 2 0 0 0 5 8.4L3.4 11.5a2 2 0 0 0 0 1L5 15.6a2 2 0 0 0 1.8 1.1h10.4a2 2 0 0 0 1.8-1.1l1.6-3.1z"/><circle cx="12" cy="12" r="2.2"/></svg>
        </div>
        <h3>Contacts &amp; tags</h3>
        <p>Custom fields, CSV import, automatic deduplication. Every contact keeps its full conversation and deal history.</p>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">03</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16"/></svg>
        </div>
        <h3>Sales pipelines</h3>
        <p>Kanban boards with deals linked directly to conversations — see chat history without leaving the pipeline.</p>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">04</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-7-7 18-3-8-8-3z"/></svg>
        </div>
        <h3>Broadcasts</h3>
        <p>Meta-approved templates with delivery + read tracking and per-recipient variable substitution.</p>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">05</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7.8 7.2L11 16M16.2 7.2L13 16M8 6h8"/></svg>
        </div>
        <h3>No-code automations</h3>
        <p>Visual builder — trigger on inbound messages, new contacts, keywords, or schedule. Branches, waits, tags, webhooks.</p>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">06</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M11 19V5M18 19v-7"/><path d="M3 19h18"/></svg>
        </div>
        <h3>Real-time dashboard</h3>
        <p>Response times, daily volume, pipeline value, and a cross-module activity feed — all live.</p>
      </article>

      <article class="feature-card">
        <span class="feature-num mono">07</span>
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"/><path d="M17 8.2a3.2 3.2 0 1 1 0 6.2M21.5 19c0-2.6-1.9-4.6-4.6-5.3"/></svg>
        </div>
        <h3>Team accounts</h3>
        <p>Invite by link, role-based access (owner / admin / agent / viewer), ownership transfer. Solo use stays zero-setup.</p>
      </article>

      <article class="feature-card wide full">
        <div>
          <span class="feature-num mono">08</span>
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 6l-2 12"/></svg>
          </div>
          <h3>Public REST API</h3>
          <p>Scoped, revocable API keys for building custom automations on top of your CRM data.</p>
        </div>
        <div class="mini-code">
          <span class="mini-code-line"><span class="mc-prompt">$</span> curl https://app.repeatgrow.com/api/v1/contacts \\</span>
          <span class="mini-code-line">&nbsp;&nbsp;-H "Authorization: Bearer rg_sk_live_••••"</span>
          <span class="mc-out">{"contacts": 1842, "status": "ok"}</span>
        </div>
      </article>
    </div>
  </div>
</section>

<!-- ============================= WHY REPEAT GROW ============================= -->
<section id="why-us" class="why-fork section-alt">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">Why Repeat Grow</span>
      <h2>Built to turn conversations into repeat revenue</h2>
      <p>Most WhatsApp tools are just messaging apps. Repeat Grow is a CRM — every conversation is tied to a contact, a deal, and a next step, so no lead falls through the cracks.</p>
    </div>
    <div class="fork-list reveal">
      <div class="fork-item">
        <span class="num mono">01</span>
        <div>
          <h3>Official WhatsApp Business API</h3>
          <p>Verified, compliant messaging on your own business number — not a jailbroken app or a shared inbox that can get banned.</p>
        </div>
      </div>
      <div class="fork-item">
        <span class="num mono">02</span>
        <div>
          <h3>Live in days, not months</h3>
          <p>We handle setup, WhatsApp verification, and data import for you. Your team starts working from the shared inbox almost immediately.</p>
        </div>
      </div>
      <div class="fork-item">
        <span class="num mono">03</span>
        <div>
          <h3>Built for repeat business</h3>
          <p>Pipelines, tags, and automations keep every contact moving — so first-time buyers turn into repeat customers instead of one-off chats.</p>
        </div>
      </div>
      <div class="fork-item">
        <span class="num mono">04</span>
        <div>
          <h3>Secure by default</h3>
          <p>Encrypted credentials, strict access controls, verified webhooks, and rate limiting protect your customer data around the clock.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ============================= HOW IT WORKS ============================= -->
<section id="how-it-works">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">Product tour</span>
      <h2>One shared number. Every conversation, tied to a deal.</h2>
      <p>Every inbound WhatsApp message lands in the shared inbox — and stays linked to its pipeline stage, so nobody's chasing context across tools.</p>
    </div>

    <div class="app-window reveal">
      <div class="app-window-bar">
        <div class="window-dots"><i></i><i></i><i></i></div>
        <span class="app-url">app.repeatgrow.com/inbox</span>
      </div>
      <div class="app-window-body">
        <div class="app-col">
          <div class="app-col-head">Conversations</div>
          <div class="conv-item active">
            <div class="mini-avatar" style="background:#3ecf8e">RS</div>
            <div class="meta"><div class="name">Riya Shah</div><div class="prev">Can I get the pro plan invoice?</div></div>
            <div class="time">2m</div>
          </div>
          <div class="conv-item">
            <div class="mini-avatar" style="background:#e0b95a">AK</div>
            <div class="meta"><div class="name">Amit Kulkarni</div><div class="prev">Sure, sending payment now</div></div>
            <div class="time">14m</div>
          </div>
          <div class="conv-item">
            <div class="mini-avatar" style="background:#5a9bd4">MN</div>
            <div class="meta"><div class="name">Meera Naidu</div><div class="prev">Thanks, that resolved it!</div></div>
            <div class="time">1h</div>
          </div>
          <div class="conv-item">
            <div class="mini-avatar" style="background:#c46e8e">JT</div>
            <div class="meta"><div class="name">Jason Tan</div><div class="prev">What's the bulk pricing?</div></div>
            <div class="time">3h</div>
          </div>
          <div class="conv-item">
            <div class="mini-avatar" style="background:#8a6fd1">SW</div>
            <div class="meta"><div class="name">Sara Wilson</div><div class="prev">Any updates on my order?</div></div>
            <div class="time">5h</div>
          </div>
        </div>

        <div class="thread">
          <div class="bubble in">Hi! I saw your post about the Business plan — is it still available?<span class="ts">10:38</span></div>
          <div class="bubble out">Yes, absolutely — let me pull up the details for you.<span class="ts">10:39 &middot; Priya (agent)</span></div>
          <div class="bubble in">Hey, can I get the pro plan invoice for this month?<span class="ts">10:42</span></div>
          <div class="bubble out">On it — sending the PDF to this number now.<span class="ts">10:43 &middot; Priya (agent)</span></div>
          <div class="bubble in">Perfect, thank you!<span class="ts">10:44</span></div>
          <div class="composer">
            <span class="composer-text">Type a message&hellip;</span>
            <span class="composer-send" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </span>
          </div>
        </div>

        <div class="side-panel">
          <div class="side-block">
            <div class="label">Assigned to</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="mini-avatar" style="width:24px;height:24px;font-size:10px;background:#3ecf8e;">PS</div>
              <span style="font-size:13px;color:var(--text);font-weight:600;">Priya Sharma</span>
            </div>
          </div>
          <div class="side-block">
            <div class="label">Pipeline stage</div>
            <div class="stage-track"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i></div>
            <p style="font-size:12px;color:var(--text-dim);margin-top:8px;">Negotiation &middot; 3 of 5</p>
          </div>
          <div class="side-block">
            <div class="label">Deal value</div>
            <div class="deal-value">$4,200</div>
          </div>
          <div class="side-block">
            <div class="label">Tags</div>
            <div class="tag-row">
              <span class="tag-chip">pro-plan</span>
              <span class="tag-chip">renewal</span>
              <span class="tag-chip">high-intent</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="how-caption">Every panel above is <span class="mono">Repeat Grow</span> — no separate invoicing tool, no separate pipeline tool.</p>
  </div>
</section>

<!-- ============================= PRICING TEASER ============================= -->
<section id="pricing" class="section-alt pricing-teaser">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">Pricing</span>
      <h2>Simple, published pricing</h2>
      <p>Plans that scale with your contacts and team — starting at &#8377;499/month. No hidden fees. We handle WhatsApp Business API setup on every plan.</p>
      <div class="hero-ctas" style="justify-content:center; margin-top:28px;">
        <a href="/pricing" class="btn btn-primary">See plans &amp; pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- ============================= FINAL CTA BAND ============================= -->
<section class="cta-band">
  <div class="container">
    <span class="eyebrow" style="justify-content:center;">Ready when you are</span>
    <h2 style="margin-top:18px;">Turn WhatsApp into your best sales channel.</h2>
    <p>Start free, or message us on WhatsApp and we'll get your team set up on Repeat Grow — usually live within days.</p>
    <div class="hero-ctas">
      <a href="/signup" class="btn btn-primary">Start Free Trial</a>
      <a href="https://wa.me/916377568749" target="_blank" rel="noopener" class="btn btn-ghost">Message us on WhatsApp</a>
    </div>
  </div>
</section>

</main>




`;


export default function Home() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div
        className="lp-page"
        dangerouslySetInnerHTML={{
          __html: LANDING_NAV_HTML + LANDING_BODY_HTML + LANDING_FOOTER_HTML,
        }}
      />
      <Script
        id="landing-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT }}
      />
    </>
  );
}
