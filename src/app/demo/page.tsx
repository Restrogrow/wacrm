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

const DEMO_TITLE = "Book a Demo";
const DEMO_DESCRIPTION =
  "Book a free 20-minute Repeat Grow demo. See the WhatsApp shared inbox, AI chatbot, broadcasts, Shopify and Calendly integrations, and payments on your own use case.";

const DEMO_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    buildBreadcrumbNode([{ name: "Book a demo", path: "/demo" }]),
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
@media (max-width: 860px){
  .lp-page .demo-wrap{ grid-template-columns:1fr; gap:32px; }
  .lp-page .demo-form .row{ grid-template-columns:1fr; }
}
`;

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';

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
          <li>${CHECK}<span>Shopify order messages, Calendly reminders, WhatsApp Pay and UPI orders, and voice calls in the browser.</span></li>
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
