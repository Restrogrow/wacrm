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
