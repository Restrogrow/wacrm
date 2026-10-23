import type { Metadata } from "next";
import Script from "next/script";
import { LANDING_CSS } from "@/lib/landing-css";
import { LANDING_SCRIPT } from "@/lib/landing-script";
import {
  LANDING_NAV_HTML,
  LANDING_FOOTER_HTML,
  LANDING_WHATSAPP_FLOAT_HTML,
} from "@/lib/landing-chrome";
import { BRAND_KEYWORDS, SITE_URL, buildBreadcrumbNode, buildFAQNode } from "@/lib/seo";

const DEMO_TITLE = "Book a Free Demo";
const DEMO_DESCRIPTION =
  "Book a free 20-minute Repeat Grow demo and see the WhatsApp inbox, AI chatbot, broadcasts, payments and integrations on your own use case.";

// Answers mirror the homepage FAQ and pricing; keep them in step.
const DEMO_FAQS = [
  {
    question: "Is the demo free?",
    answer: "Yes. The demo is free and there is no obligation to buy. It takes about 20 minutes.",
  },
  {
    question: "Do I need the WhatsApp Business API before the demo?",
    answer:
      "No. Most people we talk to are not on the API yet. We explain how it works in the demo, and if you sign up we handle WhatsApp Business verification and number setup for you. Setup is included on every plan.",
  },
  {
    question: "Can I keep using the WhatsApp Business app on my phone?",
    answer:
      "Yes. With coexistence, one number works in both the WhatsApp Business app and Repeat Grow, and chats from the phone sync into the shared inbox.",
  },
  {
    question: "What does Repeat Grow cost?",
    answer:
      "Plans start at ₹999 per month (Starter), with Growth at ₹1,999 (adds the AI chatbot) and Pro at ₹3,999 (adds the AI voice agent). WhatsApp message fees are billed by Meta directly. We go through what your team would need in the demo.",
  },
  {
    question: "Can I try it myself instead?",
    answer:
      "Yes. Every new account gets a 7-day free trial with Growth limits, and no credit card is needed. Many teams book a demo first so the trial starts set up for their use case.",
  },
  {
    question: "How soon will you contact me?",
    answer:
      "We reply on WhatsApp or email, usually within one working day, to pick a time that suits you.",
  },
];

const DEMO_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    buildBreadcrumbNode([{ name: "Book a demo", path: "/demo" }]),
    buildFAQNode(DEMO_FAQS),
    {
      "@type": "ContactPage",
      name: "Book a Repeat Grow demo",
      url: `${SITE_URL}/demo`,
      description: DEMO_DESCRIPTION,
      isPartOf: { "@type": "WebSite", name: "Repeat Grow", url: SITE_URL },
    },
  ],
};

export const metadata: Metadata = {
  title: DEMO_TITLE,
  description: DEMO_DESCRIPTION,
  keywords: BRAND_KEYWORDS,
  alternates: { canonical: "/demo" },
  openGraph: {
    type: "website",
    url: "/demo",
    title: `${DEMO_TITLE} | Repeat Grow`,
    description: DEMO_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${DEMO_TITLE} | Repeat Grow`,
    description: DEMO_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

const DEMO_CSS = `
.lp-page .demo-wrap{ display:grid; grid-template-columns: 1fr 1.1fr; gap:48px; align-items:start; }
.lp-page .demo-points{ list-style:none; padding:0; margin:24px 0 0; display:flex; flex-direction:column; gap:14px; }
.lp-page .demo-points li{ display:flex; gap:12px; font-size:15px; color:var(--text-muted); line-height:1.6; }
.lp-page .demo-points svg{ width:18px; height:18px; flex:none; margin-top:3px; color:var(--accent); }
.lp-page .demo-form{ border:1px solid var(--border); border-radius:var(--radius-lg); padding:28px; background:var(--bg); display:grid; gap:16px; }
.lp-page .demo-form label{ display:grid; gap:6px; font-size:13.5px; font-weight:600; color:var(--text); }
.lp-page .demo-form label span.opt{ font-weight:400; color:var(--text-dim); }
.lp-page .demo-form input, .lp-page .demo-form select, .lp-page .demo-form textarea{
  font: inherit; font-size:15px; font-weight:400; color:var(--text); background:var(--bg);
  border:1px solid var(--border-strong); border-radius:10px; padding:11px 13px; width:100%;
}
.lp-page .demo-form textarea{ min-height:84px; resize:vertical; }
.lp-page .demo-form input:focus, .lp-page .demo-form select:focus, .lp-page .demo-form textarea:focus{ outline:2px solid var(--accent); outline-offset:1px; }
.lp-page .demo-form .row{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.lp-page .demo-form .hp{ position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
.lp-page .demo-form .btn{ width:100%; }
.lp-page .demo-form .form-msg{ font-size:14px; min-height:20px; }
.lp-page .demo-form .form-msg.err{ color:#b42318; }
.lp-page .demo-form .form-msg.ok{ color:var(--accent-deep, #0a7a4b); font-weight:600; }
.lp-page .demo-fine{ font-size:12.5px; color:var(--text-dim); }
.lp-page .demo-steps{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-top:32px; }
.lp-page .demo-steps .feature-card h3{ font-size:18px; margin:0 0 8px; }
.lp-page .demo-steps .feature-card p{ font-size:14.5px; color:var(--text-muted); line-height:1.6; margin:0; }
.lp-page .demo-who{ display:grid; grid-template-columns:repeat(2,1fr); gap:14px 32px; list-style:none; padding:0; margin:28px 0 0; }
.lp-page .demo-who li{ font-size:15px; color:var(--text-muted); line-height:1.6; }
.lp-page .demo-who strong{ color:var(--text); }
.lp-page .demo-who a, .lp-page .demo-links a{ color:var(--accent-deep); text-decoration:underline; text-underline-offset:3px; }
.lp-page .demo-faq{ max-width:820px; margin:32px auto 0; }
.lp-page .demo-links{ margin-top:28px; font-size:14.5px; color:var(--text-muted); text-align:center; line-height:1.9; }
@media (max-width: 860px){
  .lp-page .demo-wrap{ grid-template-columns:1fr; gap:32px; }
  .lp-page .demo-form .row{ grid-template-columns:1fr; }
  .lp-page .demo-steps, .lp-page .demo-who{ grid-template-columns:1fr; }
}
`;

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';

const DEMO_FAQ_HTML = DEMO_FAQS.map(
  (faq, index) => `
      <details class="faq-item"${index === 0 ? " open" : ""}>
        <summary>${faq.question}</summary>
        <p>${faq.answer}</p>
      </details>`
).join("");

const DEMO_BODY_HTML = `
<main id="top">
<header class="hero pricing-hero">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Free 20-minute demo</span>
      <h1>See Repeat Grow working on your business</h1>
      <p>Tell us what you sell and how your team talks to customers. We will show you the shared inbox, AI chatbot, broadcasts and integrations set up for that, and answer your questions about the WhatsApp Business API.</p>
    </div>
  </div>
</header>

<section>
  <div class="container">
    <div class="demo-wrap">
      <div>
        <h2 style="font-size:24px;">What happens in the demo</h2>
        <ul class="demo-points">
          <li>${CHECK}<span>A walkthrough of the shared inbox, pipelines and broadcasts, using examples from your industry.</span></li>
          <li>${CHECK}<span>How the AI chatbot answers from your own FAQs and hands over to your team.</span></li>
          <li>${CHECK}<span>Shopify order messages, Calendly reminders, WhatsApp Pay and UPI orders, voice calls in the browser, and the AI voice agent that calls your leads.</span></li>
          <li>${CHECK}<span>What it costs, what Meta charges separately, and how we set up your WhatsApp Business API number.</span></li>
        </ul>
        <p class="demo-fine" style="margin-top:24px;">We reply on WhatsApp or email, usually within one working day. Prefer to talk now? <a href="https://wa.me/916377568749" target="_blank" rel="noopener" style="color:var(--accent-deep);text-decoration:underline;text-underline-offset:3px;">Message us on WhatsApp</a>.</p>
      </div>

      <form class="demo-form" id="demoForm" novalidate>
        <div class="row">
          <label>Your name
            <input name="name" type="text" autocomplete="name" required maxlength="120">
          </label>
          <label>Business name
            <input name="business_name" type="text" autocomplete="organization" required maxlength="160">
          </label>
        </div>
        <div class="row">
          <label>WhatsApp number
            <input name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210" required maxlength="32">
          </label>
          <label>Email <span class="opt">(optional)</span>
            <input name="email" type="email" autocomplete="email" maxlength="200">
          </label>
        </div>
        <div class="row">
          <label>Team size
            <select name="team_size">
              <option value="">Select</option>
              <option>Just me</option>
              <option>2 to 5</option>
              <option>6 to 25</option>
              <option>26 or more</option>
            </select>
          </label>
          <label>Mainly interested in
            <select name="use_case">
              <option value="">Select</option>
              <option>Shared inbox and support</option>
              <option>Broadcasts and campaigns</option>
              <option>AI chatbot</option>
              <option>Shopify order updates</option>
              <option>Appointment reminders</option>
              <option>Payments and orders</option>
              <option>WhatsApp Business API setup</option>
              <option>Something else</option>
            </select>
          </label>
        </div>
        <label>Anything we should know? <span class="opt">(optional)</span>
          <textarea name="message" maxlength="1000"></textarea>
        </label>
        <div class="hp" aria-hidden="true">
          <label>Website <input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        </div>
        <button type="submit" class="btn btn-primary" id="demoSubmit">Request my demo</button>
        <p class="form-msg" id="demoMsg" role="status" aria-live="polite"></p>
        <p class="demo-fine">We only use these details to contact you about the demo.</p>
      </form>
    </div>
  </div>
</section>

<section class="section-alt">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">How it works</span>
      <h2>From request to a working WhatsApp setup</h2>
    </div>
    <div class="demo-steps">
      <div class="feature-card"><span class="feature-num">01</span><h3>Send the form</h3><p>Tell us your business, team size and what you want WhatsApp to do. It takes a minute.</p></div>
      <div class="feature-card"><span class="feature-num">02</span><h3>We pick a time with you</h3><p>We message you on WhatsApp or email, usually within one working day, and fix a slot that suits you.</p></div>
      <div class="feature-card"><span class="feature-num">03</span><h3>20-minute walkthrough</h3><p>We show Repeat Grow on your use case and answer your questions. If it fits, we set up your WhatsApp Business API number for you.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Who it is for</span>
      <h2>Teams that sell and support on WhatsApp</h2>
      <p>The demo is shaped around your industry. These are the setups we show most often.</p>
    </div>
    <ul class="demo-who">
      <li><strong>Online stores and D2C brands:</strong> Shopify order, COD and shipping messages, abandoned carts and broadcasts. <a href="/whatsapp-crm-for-ecommerce">WhatsApp CRM for e-commerce</a></li>
      <li><strong>Real estate teams:</strong> property enquiries, lead follow-ups and a sales pipeline. <a href="/whatsapp-crm-for-real-estate">WhatsApp CRM for real estate</a></li>
      <li><strong>Coaching and education:</strong> student enquiries, follow-ups and reminders. <a href="/whatsapp-crm-for-education">WhatsApp CRM for education</a></li>
      <li><strong>Clinics, salons and services:</strong> Calendly bookings and reminders that cut no-shows. <a href="/blog/whatsapp-appointment-reminders">Appointment reminder guide</a></li>
      <li><strong>Teams moving from another tool:</strong> what changes, what it costs and how your number moves. <a href="/wati-vs-interakt-vs-aisensy">WATI vs Interakt vs AiSensy</a></li>
      <li><strong>Businesses new to the API:</strong> how it differs from the WhatsApp Business app. <a href="/whatsapp-crm-vs-whatsapp-business-app">CRM vs WhatsApp Business app</a></li>
    </ul>
  </div>
</section>

<section class="section-alt">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Get the most from 20 minutes</span>
      <h2>What to have ready</h2>
    </div>
    <ul class="demo-points" style="max-width:720px;margin:28px auto 0;">
      <li>${CHECK}<span>The WhatsApp number you use for business, and whether it is on the WhatsApp Business app today.</span></li>
      <li>${CHECK}<span>Roughly how many customer chats your team handles a day, and how many people answer them.</span></li>
      <li>${CHECK}<span>The tools you already use, such as Shopify, Calendly, a payment gateway or a CRM.</span></li>
      <li>${CHECK}<span>One or two messages you send again and again. We will show you how to automate them.</span></li>
    </ul>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">FAQ</span>
      <h2>Questions about the demo</h2>
    </div>
    <div class="faq-list demo-faq">${DEMO_FAQ_HTML}
    </div>
    <p class="demo-links">Not ready to talk yet? See <a href="/pricing">plans and pricing</a>, read our <a href="/blog">WhatsApp Business guides</a>, or browse the <a href="/docs">Help Center</a>.<br><a href="#top">Back to the demo form</a></p>
  </div>
</section>
</main>
`;

const DEMO_SCRIPT = `
(function(){
  var form = document.getElementById('demoForm');
  if (!form) return;
  var msg = document.getElementById('demoMsg');
  var btn = document.getElementById('demoSubmit');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    msg.className = 'form-msg';
    msg.textContent = '';
    var data = {};
    new FormData(form).forEach(function(v, k){ data[k] = String(v); });
    data.source_page = document.referrer ? new URL(document.referrer).pathname : '/demo';
    btn.disabled = true;
    btn.textContent = 'Sending...';
    fetch('/api/demo-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){ return { ok: r.ok, body: j }; });
    }).then(function(res){
      if (res.ok) {
        form.reset();
        if (window.gtag) { window.gtag('event', 'generate_lead', { event_category: 'demo_request', value: 1 }); }
        msg.className = 'form-msg ok';
        msg.textContent = 'Thanks! We have your request and will message you soon.';
        btn.textContent = 'Request sent';
      } else {
        msg.className = 'form-msg err';
        msg.textContent = (res.body && res.body.error) || 'Something went wrong. Please try again or WhatsApp us.';
        btn.disabled = false;
        btn.textContent = 'Request my demo';
      }
    }).catch(function(){
      msg.className = 'form-msg err';
      msg.textContent = 'Network problem. Please try again or WhatsApp us.';
      btn.disabled = false;
      btn.textContent = 'Request my demo';
    });
  });
})();
`;

export default function DemoPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DEMO_STRUCTURED_DATA) }}
      />
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS + DEMO_CSS }} />
      <div
        className="lp-page"
        dangerouslySetInnerHTML={{
          __html:
            LANDING_NAV_HTML +
            DEMO_BODY_HTML +
            LANDING_FOOTER_HTML +
            LANDING_WHATSAPP_FLOAT_HTML,
        }}
      />
      <Script
        id="demo-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT + DEMO_SCRIPT }}
      />
    </>
  );
}
