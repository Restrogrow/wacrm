// Stylesheet for /docs and /docs/api. Builds on the marketing site's
// tokens (LANDING_CSS, scoped under .lp-page) so the docs share its
// nav, footer, colours, and type. Everything here is scoped under
// .lp-page .docs so it can't leak into the app.
export const DOCS_CSS = `
.lp-page .docs{ --code-bg:#0f1720; --code-border:#1f2a37; --code-text:#e5edf5; --code-dim:#8b98a9; }

/* ---------- hero ---------- */
.lp-page .docs-hero{
  background: var(--bg-alt);
  background-image: radial-gradient(circle, rgba(22,33,44,0.07) 1px, transparent 1px);
  background-size: 22px 22px;
  border-bottom: 1px solid var(--border);
  padding: 56px 0 48px;
}
.lp-page .docs-crumbs{ font-size: 13.5px; color: var(--text-dim); margin-bottom: 16px; }
.lp-page .docs-crumbs a{ color: var(--text-muted); }
.lp-page .docs-crumbs a:hover{ color: var(--accent); }
.lp-page .docs-hero h1{ font-size: clamp(32px, 5vw, 46px); margin-top: 14px; }
.lp-page .docs-hero .lede{ margin-top: 14px; max-width: 640px; font-size: 17.5px; color: var(--text-muted); }
.lp-page .docs-hero .hero-actions{ display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; align-items: center; }
.lp-page .docs-pill{
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-radius: var(--radius-md);
  background: var(--bg); border: 1px solid var(--border-strong);
  font-family: var(--font-mono); font-size: 13px; color: var(--text);
  max-width: 100%; overflow-wrap: anywhere;
}
.lp-page .docs-pill .k{ color: var(--text-dim); }

/* ---------- layout ---------- */
.lp-page .docs-body{
  display: grid; grid-template-columns: 220px minmax(0, 1fr);
  gap: 56px; padding-top: 48px; padding-bottom: 96px;
}
.lp-page .docs-toc{ position: sticky; top: 92px; align-self: start; max-height: calc(100vh - 110px); overflow-y: auto; }
.lp-page .docs-toc .toc-title{
  font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .08em;
  text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px;
}
.lp-page .docs-toc ul{ border-left: 1px solid var(--border); }
.lp-page .docs-toc li a{
  display: block; padding: 6px 0 6px 14px; margin-left: -1px;
  border-left: 2px solid transparent;
  font-size: 14px; color: var(--text-muted);
  transition: color .15s ease, border-color .15s ease;
}
.lp-page .docs-toc li a:hover{ color: var(--text); }
.lp-page .docs-toc li a.is-active{ color: var(--accent-deep); border-left-color: var(--accent); font-weight: 600; }
.lp-page .docs-toc .toc-switch{
  display: block; margin-top: 22px; padding: 12px 14px;
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  font-size: 13.5px; color: var(--text-muted); background: var(--bg-alt);
}
.lp-page .docs-toc .toc-switch b{ display: block; color: var(--text); margin-bottom: 2px; }
.lp-page .docs-toc .toc-switch:hover{ border-color: var(--border-accent); }

.lp-page .docs-content{ min-width: 0; max-width: 780px; }

/* ---------- sections & prose ---------- */
.lp-page .docs section.docs-section{ scroll-margin-top: 92px; padding: 8px 0 0; margin-bottom: 72px; border: 0; background: none; }
.lp-page .docs-section > .prose, .lp-page .docs-section > .docs-table-wrap{ margin-top: 16px; }
.lp-page .docs-section > h2{ font-size: 26px; display: flex; align-items: center; gap: 12px; }
.lp-page .docs-section > h2 .num{
  display: inline-grid; place-items: center; width: 30px; height: 30px;
  border-radius: 8px; background: var(--accent-soft); color: var(--accent-deep);
  font-family: var(--font-mono); font-size: 13px; flex: none;
}
.lp-page .docs-section > .intro{ margin-top: 10px; color: var(--text-muted); font-size: 16px; }
.lp-page .docs-section h3{ font-size: 18px; margin-top: 32px; }
.lp-page .prose{ font-size: 15.5px; color: var(--text); }
.lp-page .prose > * + *{ margin-top: 14px; }
.lp-page .prose p{ color: #2b3644; }
.lp-page .prose a, .lp-page .docs-link{ color: var(--accent-deep); text-decoration: underline; text-decoration-color: var(--border-accent); text-underline-offset: 3px; }
.lp-page .prose a:hover, .lp-page .docs-link:hover{ text-decoration-color: var(--accent); }
.lp-page .prose ul.bullets li{ position: relative; padding-left: 20px; margin-top: 8px; }
.lp-page .prose ul.bullets li::before{
  content: ""; position: absolute; left: 4px; top: .7em;
  width: 6px; height: 6px; border-radius: 2px; background: var(--accent);
}
.lp-page code.ic{
  font-family: var(--font-mono); font-size: .86em;
  background: var(--bg-elevated-2); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 4px; color: #1d2a38; overflow-wrap: anywhere;
}
.lp-page .ui-path{
  font-weight: 600; color: var(--text);
  background: var(--accent-soft); border-radius: 4px; padding: 1px 6px;
}
.lp-page a.ui-link{ color: var(--accent-deep); text-decoration: none; transition: background .15s ease; }
.lp-page a.ui-link::after{ content: " ↗"; font-weight: 500; font-size: .85em; }
.lp-page a.ui-link:hover{ background: var(--accent-soft-strong); }
.lp-page .docs-site{ margin-top: 12px; font-size: 14px; color: var(--text-dim); }
.lp-page .docs-site a{ color: var(--accent-deep); font-weight: 600; }
.lp-page .docs-site a:hover{ text-decoration: underline; }

/* numbered steps */
.lp-page ol.steps{ counter-reset: step; margin: 18px 0 0; padding: 0; list-style: none; }
.lp-page ol.steps > li{
  counter-increment: step; position: relative;
  padding: 0 0 22px 48px;
}
.lp-page ol.steps > li::before{
  content: counter(step); position: absolute; left: 0; top: -2px;
  width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--bg); border: 1.5px solid var(--border-accent);
  color: var(--accent-deep); font-weight: 700; font-size: 13.5px; font-family: var(--font-mono);
}
.lp-page ol.steps > li::after{
  content: ""; position: absolute; left: 14.5px; top: 32px; bottom: 4px;
  width: 1.5px; background: var(--border);
}
.lp-page ol.steps > li:last-child{ padding-bottom: 0; }
.lp-page ol.steps > li:last-child::after{ display: none; }
.lp-page ol.steps > li b.step-title{ display: block; font-size: 15.5px; margin-bottom: 2px; }
.lp-page ol.steps > li span.step-body{ color: var(--text-muted); font-size: 15px; }

/* callouts */
.lp-page .callout{
  display: flex; gap: 12px; padding: 14px 16px; margin-top: 18px;
  border-radius: var(--radius-lg); border: 1px solid var(--border-accent);
  background: var(--accent-soft); font-size: 14.5px; color: #1f3b2f;
}
.lp-page .callout svg{ flex: none; width: 18px; height: 18px; margin-top: 2px; color: var(--accent-deep); }
.lp-page .callout.warn{ border-color: rgba(240,180,41,.45); background: rgba(240,180,41,.10); color: #4a3a0c; }
.lp-page .callout.warn svg{ color: #b7860b; }

/* topic cards */
.lp-page .topic-grid{ display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-bottom: 64px; }
.lp-page .topic-card{
  display: flex; flex-direction: column; gap: 6px;
  padding: 18px; border: 1px solid var(--border); border-radius: var(--radius-lg);
  background: var(--bg); transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.lp-page .topic-card:hover{ border-color: var(--border-accent); box-shadow: 0 8px 24px -16px rgba(13,169,104,.5); transform: translateY(-1px); }
.lp-page .topic-card .ico{
  width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
  background: var(--accent-soft); color: var(--accent-deep); margin-bottom: 6px;
}
.lp-page .topic-card .ico svg{ width: 18px; height: 18px; }
.lp-page .topic-card b{ font-size: 15px; }
.lp-page .topic-card span{ font-size: 13.5px; color: var(--text-muted); line-height: 1.45; }

/* tables */
.lp-page .docs-table-wrap{ margin-top: 18px; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow-x: auto; }
.lp-page table.docs-table{ width: 100%; border-collapse: collapse; font-size: 14px; }
.lp-page table.docs-table th{
  text-align: left; font-weight: 600; font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--text-dim); background: var(--bg-alt); padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.lp-page table.docs-table td{ padding: 11px 14px; border-top: 1px solid var(--border); vertical-align: top; color: #2b3644; }
.lp-page table.docs-table tr:first-child td{ border-top: 0; }
.lp-page table.docs-table td:first-child{ white-space: nowrap; }

/* FAQ */
.lp-page .faq details{ border: 1px solid var(--border); border-radius: var(--radius-lg); margin-top: 10px; background: var(--bg); }
.lp-page .faq summary{
  cursor: pointer; list-style: none; padding: 15px 18px; font-weight: 600; font-size: 15px;
  display: flex; justify-content: space-between; gap: 12px;
}
.lp-page .faq summary::-webkit-details-marker{ display: none; }
.lp-page .faq summary::after{ content: "+"; color: var(--accent); font-family: var(--font-mono); font-size: 18px; line-height: 1; }
.lp-page .faq details[open] summary::after{ content: "–"; }
.lp-page .faq details p{ padding: 0 18px 16px; color: var(--text-muted); font-size: 15px; }

/* help box */
.lp-page .help-box{
  display: flex; flex-wrap: wrap; gap: 18px; align-items: center; justify-content: space-between;
  padding: 24px; border-radius: 14px; border: 1px solid var(--border);
  background: linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--bg);
}
.lp-page .help-box h3{ font-size: 19px; margin: 0; }
.lp-page .help-box p{ margin-top: 4px; color: var(--text-muted); font-size: 15px; }
.lp-page .help-box .actions{ display: flex; gap: 10px; flex-wrap: wrap; }

/* ---------- code ---------- */
.lp-page .code{
  margin-top: 16px; border-radius: var(--radius-lg); overflow: hidden;
  background: var(--code-bg); border: 1px solid var(--code-border);
}
.lp-page .code-head{
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 0 8px 0 14px; min-height: 38px; border-bottom: 1px solid var(--code-border);
  font-family: var(--font-mono); font-size: 12px; color: var(--code-dim);
}
.lp-page .code-tabs{ display: flex; gap: 2px; align-self: stretch; }
.lp-page .code-tabs button{
  background: none; border: 0; padding: 0 10px; color: var(--code-dim);
  font-family: var(--font-mono); font-size: 12px; border-bottom: 2px solid transparent;
}
.lp-page .code-tabs button:hover{ color: var(--code-text); }
.lp-page .code-tabs button.is-active{ color: #fff; border-bottom-color: var(--accent); }
.lp-page .copy-btn{
  background: transparent; border: 1px solid var(--code-border); color: var(--code-dim);
  border-radius: 6px; padding: 4px 9px; font-size: 11.5px; font-family: var(--font-mono);
  transition: color .15s ease, border-color .15s ease;
}
.lp-page .copy-btn:hover{ color: #fff; border-color: #3a4a5c; }
.lp-page .copy-btn.is-done{ color: #4ade80; border-color: rgba(74,222,128,.4); }
.lp-page .code pre{
  margin: 0; padding: 16px 18px; overflow-x: auto;
  font-family: var(--font-mono); font-size: 13px; line-height: 1.65; color: var(--code-text);
  tab-size: 2;
}

/* ---------- endpoints ---------- */
.lp-page .ep-index{ display: grid; gap: 6px; margin-top: 18px; }
.lp-page .ep-index a{
  display: flex; align-items: center; gap: 12px; padding: 9px 12px;
  border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg);
  font-size: 14px; transition: border-color .15s ease;
}
.lp-page .ep-index a:hover{ border-color: var(--border-accent); }
.lp-page .ep-index .path{ font-family: var(--font-mono); font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
.lp-page .ep-index .sum{ margin-left: auto; color: var(--text-dim); font-size: 13px; text-align: right; }

.lp-page .method{
  display: inline-block; min-width: 58px; text-align: center; flex: none;
  padding: 3px 8px; border-radius: 5px;
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; letter-spacing: .03em;
}
.lp-page .method.get{ background: #e0f2fe; color: #0369a1; }
.lp-page .method.post{ background: #dcfce7; color: #15803d; }
.lp-page .method.patch{ background: #fef3c7; color: #a16207; }
.lp-page .method.delete{ background: #ffe4e6; color: #be123c; }

.lp-page .ep-group{ margin-top: 40px; }
.lp-page .ep-group > h3{ font-size: 20px; margin-top: 0; }
.lp-page .ep-group > p{ margin-top: 4px; color: var(--text-muted); font-size: 15px; }
.lp-page .endpoint{
  scroll-margin-top: 92px; margin-top: 18px; padding: 22px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--bg);
}
.lp-page .endpoint:target{ border-color: var(--border-accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.lp-page .ep-head{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.lp-page .ep-head .path{ font-family: var(--font-mono); font-size: 14.5px; font-weight: 600; overflow-wrap: anywhere; }
.lp-page .ep-head .scope{
  margin-left: auto; font-family: var(--font-mono); font-size: 11.5px;
  padding: 3px 8px; border-radius: 999px; border: 1px solid var(--border-strong); color: var(--text-muted);
}
.lp-page .endpoint h4{ font-size: 17px; margin-top: 14px; }
.lp-page .endpoint .desc{ margin-top: 6px; color: var(--text-muted); font-size: 15px; }
.lp-page .params{ margin-top: 14px; border-top: 1px solid var(--border); }
.lp-page .params li{ display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.lp-page .params li .pname{ font-family: var(--font-mono); font-size: 13px; font-weight: 600; min-width: 110px; }
.lp-page .params li .pin{ font-size: 11.5px; color: var(--text-dim); font-family: var(--font-mono); }
.lp-page .params li .pdesc{ color: var(--text-muted); }

/* ---------- responsive ---------- */
@media (max-width: 980px){
  .lp-page .docs-body{ grid-template-columns: minmax(0,1fr); gap: 0; padding-top: 0; }
  .lp-page .docs-toc{
    position: sticky; top: 68px; z-index: 20; max-height: none;
    margin: 0 -32px 28px; padding: 10px 32px; background: rgba(255,255,255,.94);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
  }
  .lp-page .docs-toc .toc-title, .lp-page .docs-toc .toc-switch{ display: none; }
  .lp-page .docs-toc ul{ display: flex; gap: 6px; overflow-x: auto; border-left: 0; scrollbar-width: none; }
  .lp-page .docs-toc li a{
    white-space: nowrap; padding: 6px 12px; margin: 0; border: 1px solid var(--border);
    border-radius: 999px; font-size: 13px;
  }
  .lp-page .docs-toc li a.is-active{ border-color: var(--border-accent); background: var(--accent-soft); }
  .lp-page .topic-grid{ grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 720px){
  .lp-page .docs-hero{ padding: 40px 0 34px; }
  .lp-page .docs-toc{ margin: 0 -20px 24px; padding: 10px 20px; }
  .lp-page .topic-grid{ grid-template-columns: minmax(0,1fr); }
  .lp-page .ep-index .sum{ display: none; }
  .lp-page .ep-head .scope{ margin-left: 0; }
  .lp-page .endpoint{ padding: 16px; }
  .lp-page .params li{ flex-direction: column; gap: 2px; }
}
`;
