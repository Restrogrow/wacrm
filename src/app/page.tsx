import type { Metadata } from "next";
import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import { HOME_CSS } from "@/lib/home-css";
import { HOME_SCRIPT } from "@/lib/home-script";
import {
  LANDING_NAV_HTML,
  LANDING_FOOTER_HTML,
  LANDING_WHATSAPP_FLOAT_HTML,
} from "@/lib/landing-chrome";
import { BLOG_POSTS } from "@/lib/blog";
import { brandSvg, type BrandIcon } from "@/lib/brand-icons";
import { BRAND_KEYWORDS, SITE_URL, buildFAQNode, buildOrganizationNode } from "@/lib/seo";

const HOME_TITLE = "Repeat Grow: WhatsApp CRM & API for Indian Businesses";
const HOME_DESCRIPTION =
  "WhatsApp CRM on the official WhatsApp Business API: shared inbox, AI chatbot, broadcasts, payments, Shopify and Calendly. 7-day free trial.";

const HOME_FAQS = [
  {
    question: "Is Repeat Grow built on the official WhatsApp Business API?",
    answer:
      "Yes. Repeat Grow runs entirely on Meta's official WhatsApp Business API (Cloud API), not a jailbroken app or an unofficial automation layer, so your number stays compliant and can't get banned for using third-party clients.",
  },
  {
    question: "How long does it take to get set up?",
    answer:
      "Most teams are live in days, not months. We handle WhatsApp Business verification, number registration, and data import for you, so your team starts working from the shared inbox almost immediately.",
  },
  {
    question: "Can I keep using the WhatsApp Business app on my phone?",
    answer:
      "Yes. With coexistence, one number works in both the WhatsApp Business app and Repeat Grow. Contacts, chat history and messages you send from the phone sync into the shared inbox, so your team sees everything. You can also move fully to Repeat Grow if you prefer.",
  },
  {
    question: "What does Repeat Grow cost?",
    answer:
      "Plans start at ₹999/month (Starter), with Growth at ₹1,999 and Pro at ₹3,999, and Enterprise is custom. Pay monthly, or save about 10% quarterly and 17% yearly. Every new account gets a 7-day free trial with Growth limits, and there are no hidden setup fees. WhatsApp Business API setup is included on every plan. WhatsApp conversation fees are billed by Meta directly.",
  },
  {
    question: "Can I take payments and send orders on WhatsApp?",
    answer:
      "Yes. Send an order with a payment request from any chat, paid through WhatsApp Pay (Razorpay, PayU, BillDesk or Zaakpay, confirmed automatically) or your UPI ID. You can also share your catalog, turn catalog carts into orders, and update customers as orders are processed, shipped and delivered.",
  },
  {
    question: "Can customers call my business on WhatsApp?",
    answer:
      "Yes. With WhatsApp calling turned on, customers can call your WhatsApp number and every agent's browser rings. The first to answer takes the call. Agents can also call customers from the chat, no phone line is needed, and calls are not recorded unless an agent switches on AI call notes, which write a summary and to-dos into the contact’s notes.",
  },
  {
    question: "Does it have an AI chatbot?",
    answer:
      "Yes. The AI chatbot answers chats from your own knowledge base, knows your opening hours, and hands the conversation to a human when asked. You can also build chatbot flows visually, or generate them with AI from a short description.",
  },
  {
    question: "Can multiple agents use the same WhatsApp number?",
    answer:
      "Yes. Repeat Grow is a shared inbox by design: multiple agents can work from one WhatsApp Business number with per-conversation assignment, status tracking, and internal notes.",
  },
  {
    question: "Does Repeat Grow integrate with other tools?",
    answer:
      "Yes. Shopify (order, shipping and abandoned-cart messages) and Calendly (booking confirmations and reminders) connect from Settings, and partner apps can connect with one click. There's also a public REST API with scoped, revocable API keys and signed outbound webhooks, so you can plug Repeat Grow into your existing stack.",
  },
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    buildOrganizationNode(),
    {
      "@type": "SoftwareApplication",
      name: "Repeat Grow",
      alternateName: "RepeatGrow",
      url: SITE_URL,
      description: HOME_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: "999",
        highPrice: "3999",
        offerCount: "3",
      },
      publisher: { "@id": SITE_URL },
    },
    buildFAQNode(HOME_FAQS),
  ],
};

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
    absolute: HOME_TITLE,
  },
  description: HOME_DESCRIPTION,
  keywords: BRAND_KEYWORDS,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  // The root layout defaults every route to noindex/nofollow since this is
  // primarily a private CRM app. This is the one public marketing page, so
  // it opts back in to being indexed.
  robots: {
    index: true,
    follow: true,
  },
};


const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ICON_SEND =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>';

const BLOG_CARDS_HTML = BLOG_POSTS.slice(0, 6)
  .map(
    (post, i) => `
      <a href="/blog/${post.slug}" class="h-tile reveal" style="--d:${i % 3}">
        <span class="cat">${post.category}</span>
        <h3>${post.title}</h3>
        <p>${post.description}</p>
        <span class="more">Read the guide ${ICON_ARROW}</span>
      </a>`
  )
  .join("");

const FAQ_HTML = HOME_FAQS.map(
  (faq, index) => `
      <details class="faq-item"${index === 0 ? " open" : ""}>
        <summary>${faq.question}</summary>
        <p>${faq.answer}</p>
      </details>`
).join("");

// Small product screens drawn in HTML/CSS (sharp at any size, no image
// downloads). Sample names and numbers are illustrative.
const UI_INBOX = `
  <div class="ui-inbox">
    <div class="ui-list">
      <div class="ui-row on"><div class="ui-av" style="background:#0da968">RS</div><div class="t"><div class="n">Riya Shah</div><div class="p">Is the blue kurta in stock?</div></div><span class="tag">Priya</span></div>
      <div class="ui-row"><div class="ui-av" style="background:#e0a33a">AK</div><div class="t"><div class="n">Amit Kulkarni</div><div class="p">Paid, thank you!</div></div></div>
      <div class="ui-row"><div class="ui-av" style="background:#4f8fd6">MN</div><div class="t"><div class="n">Meera Naidu</div><div class="p">Can I book for Saturday?</div></div></div>
      <div class="ui-row"><div class="ui-av" style="background:#c0608a">JT</div><div class="t"><div class="n">Jatin Thakur</div><div class="p">What's the bulk price?</div></div></div>
      <div class="ui-row"><div class="ui-av" style="background:#7c62d4">SV</div><div class="t"><div class="n">Sneha Verma</div><div class="p">Where is my order?</div></div></div>
    </div>
    <div class="ui-thread full">
      <div class="ui-b">Hi! Is the blue cotton kurta available in M?<small>10:41</small></div>
      <div class="ui-b out">Yes, M is in stock. Want me to reserve one for you?<small>10:42 · Priya</small></div>
      <div class="ui-b">Yes please, and can I pay by UPI?<small>10:43</small></div>
      <div class="ui-b out">Of course. Sending your order now.<small>10:43 · Priya</small></div>
      <div class="ui-composer"><span>Type a message or / for saved replies</span><span class="ui-send">${ICON_SEND}</span></div>
    </div>
  </div>`;

const UI_BOT = `
  <div class="ui-thread full">
    <div class="ui-b">Hi, are you open on Sunday?<small>21:14</small></div>
    <div class="ui-b out"><span class="who">✦ AI chatbot</span><br>Yes! We're open 10 am to 6 pm on Sundays. Would you like to book a slot?<small>21:14</small></div>
    <div class="ui-chips"><span class="ui-chip">Book a slot</span><span class="ui-chip">See prices</span><span class="ui-chip">Talk to a human</span></div>
    <div class="ui-b">Talk to a human</div>
    <div class="ui-b out"><span class="who">✦ AI chatbot</span><br>Sure, connecting you to our team now.<small>21:15</small></div>
    <div class="ui-b out ui-typing" aria-label="Agent is typing"><i></i><i></i><i></i></div>
  </div>`;

const UI_CAMPAIGN = `
  <div class="ui-camp">
    <div class="ui-camp-hd"><b>Diwali offer · 1,240 contacts</b><span class="ui-pill">Sent</span></div>
    <div class="ui-tpl"><b>Hi Riya,</b> our Diwali sale is live: 20% off everything until Sunday. Tap below to shop. 🪔</div>
    <div class="ui-bars">
      <div class="ui-bar"><span>Sent</span><div class="tr"><div class="fl" style="width:100%"></div></div><b>1,240</b></div>
      <div class="ui-bar"><span>Delivered</span><div class="tr"><div class="fl" style="width:96%"></div></div><b>1,198</b></div>
      <div class="ui-bar"><span>Read</span><div class="tr"><div class="fl" style="width:82%"></div></div><b>1,021</b></div>
      <div class="ui-bar"><span>Replied</span><div class="tr"><div class="fl" style="width:15%"></div></div><b>186</b></div>
    </div>
  </div>`;

const UI_PAYMENT = `
  <div class="ui-thread full">
    <div class="ui-b">Please send the order, I'll pay now.<small>11:02</small></div>
    <div class="ui-order">
      <div class="hd">Order #1042</div>
      <div class="ln"><span>Cotton kurta × 2</span><span>₹1,998</span></div>
      <div class="ln"><span>Shipping</span><span>₹60</span></div>
      <div class="tot"><span>Total</span><span>₹2,058</span></div>
      <span class="pay">Review and pay</span>
    </div>
    <span class="ui-paid">✓ Paid with UPI · order confirmed</span>
    <div class="ui-b out">Thank you! It ships today. We'll send tracking here.<small>11:05</small></div>
  </div>`;

const UI_FLOW = `
  <div class="ui-flow">
    <div class="ui-node"><span class="k" style="background:#e8f7f0">⚡</span><div>New message contains "price"<small>Trigger</small></div></div>
    <div class="ui-link"></div>
    <div class="ui-node"><span class="k" style="background:#eef3fb">🏷️</span><div>Tag contact "hot lead"<small>Action</small></div></div>
    <div class="ui-link"></div>
    <div class="ui-node"><span class="k" style="background:#fff6e5">✉️</span><div>Send price list template<small>WhatsApp</small></div></div>
    <div class="ui-link"></div>
    <div class="ui-node"><span class="k" style="background:#f3eefc">⏱</span><div>Wait 1 day, then follow up<small>Delay</small></div></div>
  </div>`;

const UI_KANBAN = `
  <div class="ui-kanban">
    <div class="ui-col"><span>New</span><div class="ui-deal">Riya Shah<small>₹4,200</small></div><div class="ui-deal">Jatin T.<small>₹12,000</small></div></div>
    <div class="ui-col"><span>Demo</span><div class="ui-deal">Meera N.<small>₹8,500</small></div></div>
    <div class="ui-col"><span>Won</span><div class="ui-deal">Amit K.<small>₹2,058</small></div></div>
  </div>`;

const UI_CALL = `
  <div class="ui-call">
    <div class="ui-ring"><div class="ui-av" style="background:#0da968">RS</div></div>
    <div style="margin-top:12px;font-weight:700;color:#0b1620;font-size:14px">Riya Shah is calling</div>
    <div style="font-size:12px;color:#5f6a7a">WhatsApp voice call · ringing 4 agents</div>
    <div class="ui-call-btns"><span class="ok">Answer</span><span class="no">Decline</span></div>
  </div>`;

const UI_CODE = `<div class="ui-code"><span class="c"># Send a WhatsApp message from your app</span>
curl -X POST https://repeatgrow.com/api/v1/messages \\
  -H <span class="s">"Authorization: Bearer $REPEATGROW_API_KEY"</span> \\
  -d <span class="s">'{ "to": "+919876543210", "text": "Your order shipped" }'</span>

<span class="k">→ 201</span> { "data": { "status": <span class="s">"sent"</span> } }</div>`;

// Brand icon where Simple Icons has one; otherwise a coloured dot.
const INTEGRATIONS: Array<[name: string, color: string, icon?: BrandIcon]> = [
  ["WhatsApp Business API", "#25d366", "whatsapp"],
  ["Shopify", "#7ab55c", "shopify"],
  ["Calendly", "#006bff", "calendly"],
  ["WhatsApp Pay", "#0da968", "whatsapp"],
  ["UPI", "#ff7a00"],
  ["Razorpay", "#0c2451", "razorpay"],
  ["PayU", "#a6c307"],
  ["BillDesk", "#e2231a"],
  ["Zaakpay", "#1e88e5"],
  ["Google Gemini AI", "#8e75b2", "googlegemini"],
  ["REST API & webhooks", "#16212c"],
];
const MARQUEE_HTML = INTEGRATIONS.map(
  ([name, color, icon]) =>
    `<span class="h-logo">${icon ? brandSvg(icon, color, 18) : `<i style="--c:${color}"></i>`}${name}</span>`
).join("");
const ICON_CODE =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6M14.5 4l-5 16"/></svg>';

const LANDING_BODY_HTML = `
<main id="top" class="home">

<!-- ============================= HERO ============================= -->
<header class="h-hero">
  <div class="h-hero-bg" aria-hidden="true"></div>
  <div class="container h-hero-grid">
    <div class="h-hero-copy">
      <a href="/blog/whatsapp-pay-upi-payments-india" class="h-badge"><span class="h-badge-new">New</span>Take UPI &amp; WhatsApp Pay payments in chat <span aria-hidden="true">&rarr;</span></a>
      <h1>Turn every WhatsApp chat into a <span class="h-grad">repeat customer</span>.</h1>
      <p class="h-sub">One shared WhatsApp inbox for your whole team, with an AI chatbot, broadcasts, payments and Shopify built in. On the official WhatsApp Business API, and we set it up for you.</p>
      <div class="h-ctas">
        <a href="/demo" class="btn btn-primary h-btn h-btn-glow">Book a free demo ${ICON_ARROW}</a>
        <a href="/signup" class="btn btn-ghost h-btn h-btn-ghost">Start 7-day free trial</a>
      </div>
      <ul class="h-checks">
        <li>${ICON_CHECK}No credit card</li>
        <li>${ICON_CHECK}Setup done for you</li>
        <li>${ICON_CHECK}Plans from &#8377;999/month</li>
      </ul>
    </div>

    <div class="h-hero-visual">
      <div class="h-device" role="region" aria-roledescription="carousel" aria-label="Repeat Grow product preview">
        <div class="h-device-bar"><div class="h-dots"><i></i><i></i><i></i></div><div class="h-url">repeatgrow.com/inbox</div></div>
        <div class="h-stage">
          <div class="h-slide is-active" data-url="repeatgrow.com/inbox" role="group" aria-label="Shared inbox">${UI_INBOX}</div>
          <div class="h-slide" data-url="repeatgrow.com/inbox · AI chatbot" role="group" aria-label="AI chatbot">${UI_BOT}</div>
          <div class="h-slide" data-url="repeatgrow.com/broadcasts" role="group" aria-label="Broadcasts">${UI_CAMPAIGN}</div>
          <div class="h-slide" data-url="repeatgrow.com/inbox · payments" role="group" aria-label="Payments">${UI_PAYMENT}</div>
        </div>
      </div>
      <div class="h-float f1" aria-hidden="true"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5"/></svg></span><div><b>Payment received</b><span>&#8377;2,058 · UPI</span></div></div>
      <div class="h-float f2" aria-hidden="true"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></span><div><b>Incoming WhatsApp call</b><span>Riya Shah · tap to answer</span></div></div>
      <div class="h-slider-nav" role="tablist" aria-label="Choose a preview">
        <button type="button" role="tab" aria-selected="true">Shared inbox</button>
        <button type="button" role="tab" aria-selected="false">AI chatbot</button>
        <button type="button" role="tab" aria-selected="false">Broadcasts</button>
        <button type="button" role="tab" aria-selected="false">Payments</button>
      </div>
    </div>
  </div>
</header>

<!-- ============================= PROOF STRIP ============================= -->
<section class="h-proof" aria-label="Why teams trust Repeat Grow">
  <div class="container">
    <div class="h-stats reveal">
      <div class="h-stat"><b>Official</b><span>Meta WhatsApp Cloud API, no ban risk from unofficial tools</span></div>
      <div class="h-stat"><b>&#8377;999</b><span>per month to start, every feature included</span></div>
      <div class="h-stat"><b>7 days</b><span>free trial, no credit card needed</span></div>
      <div class="h-stat"><b>Days</b><span>to go live, with API setup done for you</span></div>
    </div>
    <div class="h-marquee reveal" style="--d:1">
      <p class="h-marquee-label">Works with the tools Indian businesses already use</p>
      <div class="h-marquee-track">${MARQUEE_HTML}<span class="dup" aria-hidden="true" style="display:contents">${MARQUEE_HTML}</span></div>
    </div>
  </div>
</section>

<!-- ============================= FEATURES (BENTO) ============================= -->
<section id="features" class="h-section h-alt">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Everything in one place</span>
      <h2>One inbox. Every tool your team needs to <span class="h-grad">sell on WhatsApp</span>.</h2>
      <p>From the first message to the paid order, without stitching together three different apps.</p>
    </div>

    <div class="h-bento">
      <article class="h-card w2 reveal">
        <div class="h-card-visual" style="height:290px">${UI_INBOX}</div>
        <div class="h-card-body"><span class="h-card-tag">Shared inbox</span><h3>Your whole team on one WhatsApp number</h3><p>Assign chats, add internal notes, use saved replies and voice notes, and see who is handling what. Works alongside the WhatsApp Business app.</p></div>
      </article>
      <article class="h-card reveal" style="--d:1">
        <div class="h-card-visual" style="height:290px">${UI_BOT}</div>
        <div class="h-card-body"><span class="h-card-tag">AI chatbot</span><h3>Replies at 2 am, hands over at 10</h3><p>Answers from your own FAQs, knows your opening hours and passes the chat to a person when asked.</p></div>
      </article>

      <article class="h-card reveal">
        <div class="h-card-visual" style="height:250px">${UI_PAYMENT}</div>
        <div class="h-card-body"><span class="h-card-tag">Orders &amp; payments</span><h3>Get paid inside the chat</h3><p>Send an order with WhatsApp Pay or your UPI ID, share your catalog and turn carts into orders.</p></div>
      </article>
      <article class="h-card reveal" style="--d:1">
        <div class="h-card-visual" style="height:250px">${UI_CAMPAIGN}</div>
        <div class="h-card-body"><span class="h-card-tag">Broadcasts</span><h3>Campaigns people actually read</h3><p>Approved templates and carousels, sent now or scheduled, with delivered, read and replied counts.</p></div>
      </article>
      <article class="h-card reveal" style="--d:2">
        <div class="h-card-visual" style="height:250px">${UI_CALL}</div>
        <div class="h-card-body"><span class="h-card-tag">Voice calls</span><h3>Customers call, every agent's browser rings</h3><p>The first to answer takes it. Call back from the chat. No phone line needed.</p></div>
      </article>

      <article class="h-card w2 reveal">
        <div class="h-card-visual" style="height:300px">${UI_FLOW}</div>
        <div class="h-card-body"><span class="h-card-tag">Automations &amp; flows</span><h3>The follow-ups happen even when you're busy</h3><p>Trigger on keywords, new contacts or tags. Tag, wait, branch, create deals and send templates, or describe a chatbot flow and let AI build it.</p></div>
      </article>
      <article class="h-card reveal" style="--d:1">
        <div class="h-card-visual" style="height:300px;display:grid;align-items:center">${UI_KANBAN}</div>
        <div class="h-card-body"><span class="h-card-tag">Pipelines</span><h3>Every chat tied to a deal</h3><p>Kanban boards in rupees, with the full conversation one click away.</p></div>
      </article>

      <article class="h-card w3 reveal">
        <div class="h-wide">
          <div class="h-card-body">
            <span class="h-card-tag">Integrations &amp; API</span>
            <h3>Plugs into your store, calendar and code</h3>
            <p>Shopify order, COD, shipping and abandoned-cart messages. Calendly confirmations and reminders. A public REST API with scoped keys and signed webhooks for everything else.</p>
            <div class="h-int-badges"><span>Shopify</span><span>Calendly</span><span>REST API</span><span>Webhooks</span><span>Connect RepeatGrow</span></div>
          </div>
          <div class="h-card-visual">${UI_CODE}</div>
        </div>
      </article>
    </div>

    <div class="h-more reveal">
      <span>${ICON_CHECK}WhatsApp forms</span>
      <span>${ICON_CHECK}Carousel templates</span>
      <span>${ICON_CHECK}Scheduled broadcasts</span>
      <span>${ICON_CHECK}STOP opt-outs</span>
      <span>${ICON_CHECK}Number health checks</span>
      <span>${ICON_CHECK}Daily summary email</span>
      <span>${ICON_CHECK}Team roles</span>
      <span>${ICON_CHECK}Data export &amp; deletion</span>
    </div>
  </div>
</section>

<!-- ============================= PRODUCT TOUR (TABS) ============================= -->
<section id="how-it-works" class="h-section">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Product tour</span>
      <h2>See how a chat becomes a <span class="h-grad">paying customer</span></h2>
      <p>Click through the main screens your team will use every day.</p>
    </div>
    <div class="h-tour reveal">
      <div class="h-tabs" role="tablist" aria-label="Product tour" aria-orientation="vertical">
        <button type="button" class="h-tab" role="tab" id="tab-inbox" aria-controls="panel-inbox" aria-selected="true"><b><i>💬</i>Answer every chat</b><p>Every WhatsApp message lands in one shared inbox. Assign it, reply with saved replies, and never lose a lead to a busy phone.</p><span class="h-prog"></span></button>
        <button type="button" class="h-tab" role="tab" id="tab-bot" aria-controls="panel-bot" aria-selected="false"><b><i>✦</i>Let AI handle the repeats</b><p>The AI chatbot answers common questions day and night, then hands over to your team when it matters.</p><span class="h-prog"></span></button>
        <button type="button" class="h-tab" role="tab" id="tab-pay" aria-controls="panel-pay" aria-selected="false"><b><i>&#8377;</i>Close the sale in chat</b><p>Send the order with a payment request. Customers pay with WhatsApp Pay or UPI without leaving WhatsApp.</p><span class="h-prog"></span></button>
        <button type="button" class="h-tab" role="tab" id="tab-camp" aria-controls="panel-camp" aria-selected="false"><b><i>📣</i>Bring them back</b><p>Broadcast offers and updates with approved templates, and see who read and replied.</p><span class="h-prog"></span></button>
        <button type="button" class="h-tab" role="tab" id="tab-flow" aria-controls="panel-flow" aria-selected="false"><b><i>⚡</i>Automate the follow-up</b><p>Tag, wait and follow up automatically, so no warm lead goes cold.</p><span class="h-prog"></span></button>
      </div>
      <div class="h-panels">
        <div class="h-panel-frame">
          <div class="h-panel is-active" id="panel-inbox" role="tabpanel" aria-labelledby="tab-inbox">${UI_INBOX}</div>
          <div class="h-panel" id="panel-bot" role="tabpanel" aria-labelledby="tab-bot">${UI_BOT}</div>
          <div class="h-panel" id="panel-pay" role="tabpanel" aria-labelledby="tab-pay">${UI_PAYMENT}</div>
          <div class="h-panel" id="panel-camp" role="tabpanel" aria-labelledby="tab-camp">${UI_CAMPAIGN}</div>
          <div class="h-panel" id="panel-flow" role="tabpanel" aria-labelledby="tab-flow">${UI_FLOW}</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ============================= HOW YOU GET STARTED ============================= -->
<section id="setup" class="h-section h-alt">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Live in days</span>
      <h2>We do the setup. <span class="h-grad">You start selling.</span></h2>
      <p>No developers, no Meta paperwork headaches.</p>
    </div>
    <div class="h-steps">
      <div class="h-step reveal"><div class="n">1</div><h3>Book a free demo</h3><p>Tell us what you sell and how your team talks to customers. We show Repeat Grow on your use case.</p></div>
      <div class="h-step reveal" style="--d:1"><div class="n">2</div><h3>We set up your WhatsApp API</h3><p>Business verification, number registration and importing your contacts, done for you.</p></div>
      <div class="h-step reveal" style="--d:2"><div class="n">3</div><h3>Your team sells on WhatsApp</h3><p>Everyone works from one inbox, with automations, broadcasts and payments ready to switch on.</p></div>
    </div>
  </div>
</section>

<!-- ============================= INTEGRATIONS ============================= -->
<section id="integrations" class="h-section">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Integrations</span>
      <h2>Connects to the tools you already use</h2>
      <p>Each event maps to an approved WhatsApp template, filled with live data, with a preview, a test send and a message log.</p>
    </div>
    <div class="h-grid3">
      <div class="h-tile hov reveal"><div class="ico brand">${brandSvg("shopify", "#7AB55C", 26)}</div><h3>Shopify</h3><p>Order placed, COD confirmation, shipped with tracking, out for delivery, delivered, cancelled and abandoned-cart reminders. Connect in one click or with webhooks.</p></div>
      <div class="h-tile hov reveal" style="--d:1"><div class="ico brand">${brandSvg("calendly", "#006BFF", 26)}</div><h3>Calendly</h3><p>Booking confirmed, rescheduled and cancelled messages, no-show follow-ups, and reminders 24 hours and 1 hour before the meeting.</p></div>
      <a href="/docs/api" class="h-tile reveal" style="--d:2"><div class="ico">${ICON_CODE}</div><h3>Connect RepeatGrow &amp; API</h3><p>Partner apps connect with one click and send WhatsApp messages through the API. Or build your own with the REST API and webhooks.</p><span class="more">View the API docs ${ICON_ARROW}</span></a>
    </div>
  </div>
</section>

<!-- ============================= WHY REPEAT GROW ============================= -->
<section id="why-us" class="h-section h-alt h-why">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Why Repeat Grow</span>
      <h2>Built to turn conversations into <span class="h-grad">repeat revenue</span></h2>
      <p>Most WhatsApp tools are just messaging apps. Repeat Grow is a CRM: every conversation is tied to a contact, a deal and a next step.</p>
    </div>
    <div class="h-grid2">
      <div class="h-tile reveal"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.4 9.3-8 10-4.6-.7-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg></div><h3>Official WhatsApp Business API</h3><p>Verified, compliant messaging on your own business number, not a jailbroken app or a tool that can get your number banned.</p></div>
      <div class="h-tile reveal" style="--d:1"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg></div><h3>Live in days, not months</h3><p>We handle setup, WhatsApp verification and data import. Your team starts working from the shared inbox almost immediately.</p></div>
      <div class="h-tile reveal"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/></svg></div><h3>Built for repeat business</h3><p>Pipelines, tags and automations keep every contact moving, so first-time buyers become repeat customers.</p></div>
      <div class="h-tile reveal" style="--d:1"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><h3>Secure by default</h3><p>Encrypted credentials, strict access controls, verified webhooks and rate limiting protect your customer data around the clock.</p></div>
    </div>
  </div>
</section>

<!-- ============================= PRICING TEASER ============================= -->
<section id="pricing" class="h-section">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Pricing</span>
      <h2>Every feature on every plan</h2>
      <p>Start with a 7-day free trial. Plans only change the limits. WhatsApp API setup is included, and Meta's message fees are billed by Meta.</p>
    </div>
    <div class="h-plans reveal">
      <div class="h-plan"><span>Starter</span><b>&#8377;999<small>/month</small></b><p>For a small team getting started</p></div>
      <div class="h-plan pop"><span>Growth</span><b>&#8377;1,999<small>/month</small></b><p>More contacts, campaigns and people</p></div>
      <div class="h-plan"><span>Pro</span><b>&#8377;3,999<small>/month</small></b><p>High volume and bigger teams</p></div>
      <div class="h-plan"><span>Enterprise</span><b>Custom</b><p>No caps and hands-on setup</p></div>
    </div>
    <p class="h-plans-note reveal">Pay monthly, or save about 10% quarterly and 17% yearly.</p>
    <div class="h-center reveal">
      <a href="/pricing" class="btn btn-ghost h-btn">Compare plans ${ICON_ARROW}</a>
      <a href="/demo" class="btn btn-primary h-btn">Book a free demo</a>
    </div>
  </div>
</section>

<!-- ============================= USE CASES ============================= -->
<section id="use-cases" class="h-section h-alt">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Built for your team</span>
      <h2>WhatsApp CRM for every customer-facing team</h2>
      <p>The same inbox, pipeline and automation engine, set up for how your industry sells and supports on WhatsApp.</p>
    </div>
    <div class="h-grid3">
      <a href="/whatsapp-crm-for-ecommerce" class="h-tile reveal"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg></div><h3>E-commerce &amp; D2C</h3><p>Order updates, COD confirmations, abandoned-cart follow-ups and in-chat payments tied to each customer's order history.</p><span class="more">See e-commerce ${ICON_ARROW}</span></a>
      <a href="/whatsapp-crm-for-real-estate" class="h-tile reveal" style="--d:1"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg></div><h3>Real estate</h3><p>Property leads land straight in a pipeline, with automated site-visit reminders and listing broadcasts.</p><span class="more">See real estate ${ICON_ARROW}</span></a>
      <a href="/whatsapp-crm-for-education" class="h-tile reveal" style="--d:2"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg></div><h3>Coaching &amp; education</h3><p>Enquiry-to-enrollment pipeline, demo-class follow-ups and batch broadcasts for timetables and fee reminders.</p><span class="more">See education ${ICON_ARROW}</span></a>
    </div>
  </div>
</section>

<!-- ============================= FAQ ============================= -->
<section id="faq" class="h-section">
  <div class="container h-faq">
    <div class="h-faq-side reveal">
      <span class="h-eyebrow">FAQ</span>
      <h2>Questions, answered</h2>
      <p>Everything teams usually ask before moving their WhatsApp number to Repeat Grow. Still unsure? Talk to us.</p>
      <a href="/demo" class="btn btn-primary h-btn">Book a free demo ${ICON_ARROW}</a>
    </div>
    <div class="faq-list reveal" style="--d:1">${FAQ_HTML}
    </div>
  </div>
</section>

<!-- ============================= GUIDES ============================= -->
<section id="guides" class="h-section h-alt">
  <div class="container">
    <div class="h-head reveal">
      <span class="h-eyebrow">Guides</span>
      <h2>Learn how to sell on WhatsApp</h2>
      <p>Practical guides on the WhatsApp Business API, templates, payments and automation.</p>
    </div>
    <div class="h-grid3">${BLOG_CARDS_HTML}
    </div>
  </div>
</section>

<!-- ============================= FINAL CTA ============================= -->
<section class="h-final">
  <div class="container">
    <div class="h-final-box reveal">
      <h2>Your customers are already on WhatsApp. Start selling there properly.</h2>
      <p>Book a free 20-minute demo and see Repeat Grow on your own business, or start your trial today. We set up the WhatsApp Business API for you.</p>
      <div class="h-ctas">
        <a href="/demo" class="btn h-btn h-btn-white">Book a free demo ${ICON_ARROW}</a>
        <a href="/signup" class="btn h-btn h-btn-line">Start 7-day free trial</a>
      </div>
      <div class="h-guarantee">
        <span>${ICON_CHECK}No credit card for the trial</span>
        <span>${ICON_CHECK}No lock-in contract</span>
        <span>${ICON_CHECK}Setup included on every plan</span>
      </div>
    </div>
  </div>
</section>

</main>
`;


export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + HOME_CSS }} />
      <div
        className="lp-page"
        dangerouslySetInnerHTML={{
          __html:
            LANDING_NAV_HTML +
            LANDING_BODY_HTML +
            LANDING_FOOTER_HTML +
            LANDING_WHATSAPP_FLOAT_HTML,
        }}
      />
      <Script
        id="landing-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT + HOME_SCRIPT }}
      />
    </>
  );
}
