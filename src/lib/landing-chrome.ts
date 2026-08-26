// Shared nav + footer markup for the marketing site (/, /pricing).
// Kept identical across pages so hrefs work no matter which page you
// land on — home-page anchors are absolute ("/#features") rather than
// bare ("#features") so they still resolve correctly from /pricing.

export const LANDING_NAV_HTML = `
<nav class="site-nav">
  <div class="container">
    <a href="/" class="brand">
      <img src="/logo-v2.png" alt="Repeat Grow" class="brand-mark" width="26" height="26">
      <span class="brand-word">Repeat<span class="dim">Grow</span></span>
    </a>
    <div class="nav-links">
      <a href="/#features">Features</a>
      <a href="/#why-us">Why Us</a>
      <a href="/pricing">Pricing</a>
      <a href="#">Docs</a>
    </div>
    <div class="nav-right">
      <a href="/login" class="nav-login">Login</a>
      <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="mobileNav">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
  </div>
</nav>
<div class="mobile-nav" id="mobileNav">
  <div class="container">
    <a href="/#features">Features</a>
    <a href="/#why-us">Why Us</a>
    <a href="/pricing">Pricing</a>
    <a href="#">Docs</a>
    <a href="/login">Login</a>
  </div>
</div>
`;

export const LANDING_FOOTER_HTML = `
<footer>
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="brand">
          <img src="/logo-v2.png" alt="Repeat Grow" class="brand-mark" width="26" height="26">
          <span class="brand-word">Repeat<span class="dim">Grow</span></span>
        </a>
        <p>WhatsApp CRM for sales and support teams — built on the official WhatsApp Business API, set up and supported for you.</p>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <ul>
          <li><a href="/#features">Features</a></li>
          <li><a href="/#why-us">Why Us</a></li>
          <li><a href="/pricing">Pricing</a></li>
          <li><a href="/login">Login</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Resources</h4>
        <ul>
          <li><a href="/about">About Us</a></li>
          <li><a href="/contact">Contact Us</a></li>
          <li><a href="#">Help Center</a></li>
          <li><a href="#">API reference</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <ul>
          <li><a href="/privacy">Privacy</a></li>
          <li><a href="/terms">Terms &amp; Conditions</a></li>
          <li><a href="/disclaimer">Disclaimer</a></li>
          <li><a href="/security">Security</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 Repeat Grow. All rights reserved.</p>
      <div class="footer-badges">
        <span class="pill">Official WhatsApp Business API</span>
      </div>
    </div>
  </div>
</footer>
`;

// Persistent floating action button, fixed bottom-right on every page.
// Uses the universal WhatsApp brand green rather than the site accent —
// this is a "chat on WhatsApp" affordance, and that color is what makes
// it instantly recognizable as one.
export const LANDING_WHATSAPP_FLOAT_HTML = `
<a href="https://wa.me/916377568749" target="_blank" rel="noopener" class="whatsapp-float" aria-label="Message us on WhatsApp">
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2zm5.8 14.16c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.8-.11-.41-.13-.94-.31-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94s.73-2.09.99-2.37c.26-.29.56-.36.75-.36l.53.01c.17.01.4-.06.62.48.24.58.81 2 .88 2.15.07.15.12.32.02.52-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.68-.17 1.36z"/></svg>
</a>
`;
