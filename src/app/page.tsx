import type { Metadata } from "next";
import Script from "next/script";

// This route renders the Repeat Grow marketing homepage. It was migrated
// from a standalone static HTML file (landing-page/index.html) so it can
// live at the real site root and share the app's build/deploy pipeline
// instead of being a separate artifact that has to be kept in sync by hand.
//
// The markup/CSS/script below are embedded as raw strings (via
// dangerouslySetInnerHTML) rather than converted to JSX. All CSS selectors
// are scoped under .lp-page so nothing here leaks into the dashboard app's
// Tailwind/shadcn styling (which shares this same document).
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

const LANDING_CSS = `
.lp-page{
  --bg: #0a0d0c;
  --bg-alt: #0d1210;
  --bg-elevated: #101614;
  --bg-elevated-2: #131a17;
  --text: #e6e8e6;
  --text-muted: #8b978f;
  --text-dim: #808e88; 
  --accent: #3ecf8e;
  --accent-2: #34d399;
  --accent-soft: rgba(62,207,142,0.10);
  --accent-soft-strong: rgba(62,207,142,0.18);
  --border: rgba(230,232,230,0.09);
  --border-strong: rgba(230,232,230,0.16);
  --border-accent: rgba(62,207,142,0.28);
  --danger: #e0725a;
  --amber: #e0b95a;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace;

  --container: 1180px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
}

.lp-page *, .lp-page *::before, .lp-page *::after{ box-sizing: border-box; }html:has(.lp-page){ scroll-behavior: smooth; }.lp-page{
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.lp-page img{ max-width: 100%; display: block; }

.lp-page a{ color: inherit; text-decoration: none; }

.lp-page h1, .lp-page h2, .lp-page h3, .lp-page h4{
  margin: 0;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.lp-page p{ margin: 0; }

.lp-page ul{ margin: 0; padding: 0; list-style: none; }

.lp-page button{ font-family: inherit; cursor: pointer; }

.lp-page ::selection{ background: var(--accent-soft-strong); color: var(--text); }


.lp-page a:focus-visible, .lp-page button:focus-visible, .lp-page input:focus-visible{
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: var(--radius-sm);
}

.lp-page .container{
  max-width: var(--container);
  margin: 0 auto;
  padding: 0 32px;
}

.lp-page .mono{ font-family: var(--font-mono); }

.lp-page .eyebrow{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}
.lp-page .eyebrow::before{
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 1px;
  background: var(--accent);
  box-shadow: 0 0 8px 1px var(--accent-soft-strong);
  flex: none;
}


.lp-page .dot-grid{
  background-image: radial-gradient(circle, rgba(230,232,230,0.14) 1px, transparent 1px);
  background-size: 26px 26px;
}


.lp-page .site-nav{
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10,13,12,0.86);
  backdrop-filter: saturate(140%) blur(10px);
  border-bottom: 1px solid var(--border);
}
.lp-page .site-nav .container{
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 68px;
}
.lp-page .brand{
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--text);
}
.lp-page .brand-mark{
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex: none;
}
.lp-page .brand-word{ font-family: var(--font-mono); }
.lp-page .brand-word .dim{ color: var(--text-dim); }

.lp-page .nav-links{
  display: flex;
  align-items: center;
  gap: 34px;
}
.lp-page .nav-links a{
  font-size: 14.5px;
  color: var(--text-muted);
  transition: color .15s ease;
  position: relative;
}
.lp-page .nav-links a:hover{ color: var(--text); }
.lp-page .nav-links a::after{
  content: "";
  position: absolute;
  left: 0; right: 0; bottom: -22px;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform .18s ease;
}
.lp-page .nav-links a:hover::after{ transform: scaleX(1); }

.lp-page .nav-right{
  display: flex;
  align-items: center;
  gap: 20px;
}
.lp-page .nav-login{
  font-size: 14px;
  color: var(--text-muted);
  transition: color .15s ease;
}
.lp-page .nav-login:hover{ color: var(--text); }

.lp-page .btn{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 14.5px;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition: transform .12s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease, color .15s ease;
  white-space: nowrap;
}
.lp-page .btn:active{ transform: translateY(1px); }

.lp-page .btn-primary{
  background: var(--accent);
  color: #06120c;
  box-shadow: 0 0 0 1px rgba(62,207,142,0.4), 0 8px 20px -8px rgba(62,207,142,0.55);
}
.lp-page .btn-primary:hover{
  background: var(--accent-2);
  box-shadow: 0 0 0 1px rgba(62,207,142,0.6), 0 10px 26px -6px rgba(62,207,142,0.65);
}

.lp-page .btn-ghost{
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}
.lp-page .btn-ghost:hover{
  border-color: var(--border-accent);
  color: var(--accent);
}

.lp-page .btn-sm{ padding: 8px 14px; font-size: 13.5px; }

.lp-page .nav-toggle{
  display: none;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  color: var(--text);
}
.lp-page .nav-toggle svg{ width: 18px; height: 18px; }

.lp-page .mobile-nav{
  display: none;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}
.lp-page .mobile-nav.open{ display: block; }
.lp-page .mobile-nav .container{
  padding-top: 18px;
  padding-bottom: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lp-page .mobile-nav a:not(.btn){
  font-size: 15px;
  color: var(--text-muted);
  padding: 6px 0;
}
.lp-page .mobile-nav a:not(.btn):hover{ color: var(--text); }
.lp-page .mobile-nav .btn{ align-self: flex-start; margin-top: 6px; }


.lp-page .hero{
  position: relative;
  padding: 92px 0 100px;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}
.lp-page .hero::before{
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(230,232,230,0.16) 1px, transparent 1px);
  background-size: 28px 28px;
  -webkit-mask-image: radial-gradient(ellipse 60% 55% at 78% 20%, black, transparent 70%);
  mask-image: radial-gradient(ellipse 60% 55% at 78% 20%, black, transparent 70%);
  pointer-events: none;
}
.lp-page .hero::after{
  content: "";
  position: absolute;
  top: -180px; right: -160px;
  width: 560px; height: 560px;
  background: radial-gradient(circle, rgba(62,207,142,0.16), transparent 68%);
  filter: blur(10px);
  pointer-events: none;
}
.lp-page .hero .container{
  position: relative;
  display: grid;
  grid-template-columns: minmax(0,1.02fr) minmax(0,0.98fr);
  gap: 56px;
  align-items: center;
}

.lp-page .hero-copy, .lp-page .hero-visual, .lp-page .fork-copy, .lp-page .deploy-log, .lp-page .feature-card, .lp-page .price-card, .lp-page .app-col{
  min-width: 0;
}
.lp-page .hero-copy .eyebrow{ margin-bottom: 22px; }
.lp-page .hero h1{
  font-size: clamp(2.3rem, 4.1vw, 3.55rem);
  color: #fff;
  text-wrap: balance;
}
.lp-page .hero h1 .accent-text{ color: var(--accent); }
.lp-page .hero-sub{
  margin-top: 22px;
  font-size: 17.5px;
  color: var(--text-muted);
  max-width: 46ch;
  line-height: 1.65;
}
.lp-page .hero-ctas{
  margin-top: 34px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.lp-page .hero-meta{
  margin-top: 30px;
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-dim);
}
.lp-page .hero-meta span{ display: inline-flex; align-items: center; gap: 7px; }
.lp-page .hero-meta svg{ width: 13px; height: 13px; color: var(--accent); flex: none; }


.lp-page .terminal{
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 30px 70px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.2);
}
.lp-page .terminal-bar{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-elevated-2);
  border-bottom: 1px solid var(--border);
}
.lp-page .terminal-dots{ display: flex; gap: 7px; }
.lp-page .terminal-dots i{
  width: 10px; height: 10px; border-radius: 50%;
  background: #333;
  display: block;
}
.lp-page .terminal-dots i:nth-child(1){ background: #5a3a3a; }
.lp-page .terminal-dots i:nth-child(2){ background: #5a5238; }
.lp-page .terminal-dots i:nth-child(3){ background: #365a44; }
.lp-page .terminal-title{
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}
.lp-page .terminal-copy{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11.5px;
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  transition: border-color .15s ease, color .15s ease;
}
.lp-page .terminal-copy:hover{ border-color: var(--border-accent); color: var(--accent); }
.lp-page .terminal-copy svg{ width: 12px; height: 12px; }
.lp-page .terminal-copy.copied{ color: var(--accent); border-color: var(--border-accent); }

.lp-page .terminal-body{
  padding: 22px 22px 26px;
  font-family: var(--font-mono);
  font-size: 13.6px;
  line-height: 2;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.lp-page .terminal-body .ln{ display: block; white-space: pre; }
.lp-page .terminal-body .prompt{ color: var(--text-dim); }
.lp-page .terminal-body .cmd{ color: var(--text); }
.lp-page .terminal-body .comment{ color: var(--text-dim); }
.lp-page .terminal-body .out{ color: var(--accent); }
.lp-page .cursor{
  display: inline-block;
  width: 7px; height: 14px;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: -2px;
  animation: lp-blink 1.1s steps(1) infinite;
}
@keyframes lp-blink{ 50%{ opacity: 0; } }

.lp-page .terminal-stats{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--border);
}
.lp-page .terminal-stats > div{
  padding: 14px 16px;
  border-right: 1px solid var(--border);
}
.lp-page .terminal-stats > div:last-child{ border-right: none; }
.lp-page .terminal-stats .stat-num{
  font-family: var(--font-mono);
  color: var(--accent);
  font-size: 15px;
  font-weight: 600;
}
.lp-page .terminal-stats .stat-label{
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 3px;
  letter-spacing: 0.02em;
}


.lp-page .trust-strip{
  padding: 30px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}
.lp-page .trust-strip .container{
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: center;
}
.lp-page .pill{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--bg-elevated);
}
.lp-page .pill svg{ width: 12px; height: 12px; color: var(--accent); flex: none; }


.lp-page section{ padding: 108px 0; }
.lp-page .section-alt{ background: var(--bg-alt); }
.lp-page .section-head{
  max-width: 620px;
  margin: 0 auto 60px;
  text-align: center;
}
.lp-page .section-head.left{ margin: 0 0 56px; text-align: left; }
.lp-page .section-head .eyebrow{ margin-bottom: 16px; justify-content: center; }
.lp-page .section-head.left .eyebrow{ justify-content: flex-start; }
.lp-page .section-head h2{
  font-size: clamp(1.9rem, 3vw, 2.5rem);
  color: #fff;
}
.lp-page .section-head p{
  margin-top: 16px;
  color: var(--text-muted);
  font-size: 16.5px;
  line-height: 1.65;
}


.lp-page .reveal{
  opacity: 0;
  transform: translateY(18px);
  transition: opacity .6s cubic-bezier(.2,.7,.3,1), transform .6s cubic-bezier(.2,.7,.3,1);
}
.lp-page .reveal.is-visible{ opacity: 1; transform: translateY(0); }


.lp-page .feature-grid{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.lp-page .feature-card{
  background: var(--bg);
  padding: 30px 26px;
  transition: background .18s ease;
}
.lp-page .feature-card:hover{ background: var(--bg-elevated); }
.lp-page .feature-card.wide{
  grid-column: span 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: center;
}

.lp-page .feature-card.full{ grid-column: 1 / -1; }
.lp-page .feature-card.wide > div{ min-width: 0; }
.lp-page .feature-icon{
  width: 38px; height: 38px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--accent);
  background: var(--accent-soft);
  margin-bottom: 18px;
}
.lp-page .feature-icon svg{ width: 19px; height: 19px; }
.lp-page .feature-card h3{
  font-size: 16.5px;
  color: var(--text);
  margin-bottom: 8px;
}
.lp-page .feature-card p{
  font-size: 14.5px;
  color: var(--text-muted);
  line-height: 1.6;
}
.lp-page .feature-num{
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  display: block;
  margin-bottom: 10px;
}


.lp-page .mini-inbox{
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  overflow: hidden;
}
.lp-page .mini-inbox-row{
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.lp-page .mini-inbox-row:last-child{ border-bottom: none; }
.lp-page .mini-avatar{
  width: 22px; height: 22px;
  border-radius: 50%;
  flex: none;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: #06120c;
}
.lp-page .mini-inbox-row .who{ color: var(--text); font-weight: 600; flex: 1; }
.lp-page .mini-inbox-row .snip{ color: var(--text-dim); }
.lp-page .mini-badge{
  font-family: var(--font-mono);
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-accent);
  color: var(--accent);
  background: var(--accent-soft);
}


.lp-page .mini-code{
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  padding: 16px 18px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.9;
  overflow-x: auto;
  min-width: 0;
}
.lp-page .mini-code-line{ white-space: pre; color: var(--text-muted); display: block; }
.lp-page .mini-code .mc-prompt{ color: var(--text-dim); }
.lp-page .mini-code .mc-out{ color: var(--accent); display: block; margin-top: 6px; }


.lp-page .why-fork .container{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  
  align-items: stretch;
}
.lp-page .fork-list{
  display: flex;
  flex-direction: column;
  gap: 30px;
}
.lp-page .fork-item{
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 18px;
}
.lp-page .fork-item .num{
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-soft);
  flex: none;
}
.lp-page .fork-item h3{ font-size: 17px; margin-bottom: 6px; color: var(--text); }
.lp-page .fork-item p{ font-size: 14.5px; color: var(--text-muted); line-height: 1.65; }

.lp-page .deploy-log{
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: sticky;
  top: 96px;
  display: flex;
  flex-direction: column;
}
.lp-page .deploy-log .terminal-body{ font-size: 13px; line-height: 2.1; flex: 1; }
.lp-page .deploy-log .terminal-stats{ margin-top: auto; }
.lp-page .deploy-log .ok{ color: var(--accent); }
.lp-page .deploy-log .tag{ color: var(--text-dim); }


.lp-page .app-window{
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-elevated);
  box-shadow: 0 40px 90px -40px rgba(0,0,0,0.75);
}
.lp-page .app-window-bar{
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated-2);
}
.lp-page .app-url{
  flex: 1;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-dim);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 14px;
  text-align: center;
}
.lp-page .app-window-body{
  display: grid;
  grid-template-columns: 220px 1.3fr 1fr;
  
}
.lp-page .app-col{
  border-right: 1px solid var(--border);
  padding: 16px 0;
}
.lp-page .app-col:last-child{ border-right: none; }
.lp-page .app-col-head{
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 0 16px 12px;
}
.lp-page .conv-item{
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  border-left: 2px solid transparent;
  cursor: default;
}
.lp-page .conv-item.active{
  background: var(--accent-soft);
  border-left-color: var(--accent);
}
.lp-page .conv-item .mini-avatar{ width: 30px; height: 30px; font-size: 11px; }
.lp-page .conv-item .meta{ flex: 1; min-width: 0; }
.lp-page .conv-item .name{ font-size: 13px; color: var(--text); font-weight: 600; }
.lp-page .conv-item .prev{
  font-size: 11.5px; color: var(--text-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 130px;
}
.lp-page .conv-item .time{ font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); }

.lp-page .thread{ padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.lp-page .bubble{
  max-width: 78%;
  padding: 10px 13px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}
.lp-page .bubble.in{
  background: var(--bg);
  border: 1px solid var(--border);
  align-self: flex-start;
  color: var(--text-muted);
}
.lp-page .bubble.out{
  background: var(--accent-soft);
  border: 1px solid var(--border-accent);
  align-self: flex-end;
  color: var(--text);
}
.lp-page .bubble .ts{ display: block; margin-top: 5px; font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); }

.lp-page .composer{
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.lp-page .composer-text{
  flex: 1;
  font-size: 12.5px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 9px 14px;
  background: var(--bg);
}
.lp-page .composer-send{
  width: 30px; height: 30px;
  border-radius: 50%;
  background: var(--accent);
  color: #06120c;
  display: flex; align-items: center; justify-content: center;
  flex: none;
}
.lp-page .composer-send svg{ width: 14px; height: 14px; }

.lp-page .side-panel{ padding: 0 16px; min-width: 0; }
.lp-page .side-block{ padding: 14px 0; border-bottom: 1px solid var(--border); }
.lp-page .side-block:last-child{ border-bottom: none; }
.lp-page .side-block .label{ font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; }
.lp-page .stage-track{ display: flex; gap: 4px; }
.lp-page .stage-track i{ flex: 1; height: 5px; border-radius: 2px; background: var(--border-strong); }
.lp-page .stage-track i.on{ background: var(--accent); }
.lp-page .deal-value{ font-family: var(--font-mono); color: var(--accent); font-size: 18px; font-weight: 700; }
.lp-page .tag-row{ display: flex; gap: 6px; flex-wrap: wrap; }
.lp-page .tag-chip{
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
}

.lp-page .how-caption{
  text-align: center;
  margin-top: 22px;
  font-size: 14px;
  color: var(--text-dim);
}
.lp-page .how-caption .mono{ color: var(--accent); }


.lp-page .pricing-grid{
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 26px;
  align-items: stretch;
}
.lp-page .pricing-single{
  max-width: 480px;
  margin: 0 auto;
}
.lp-page .price-card{
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 40px;
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
}
.lp-page .price-card.featured{
  border-color: var(--border-accent);
  background: linear-gradient(180deg, var(--accent-soft), var(--bg-elevated) 45%);
  position: relative;
}
.lp-page .price-card.featured::before{
  content: "RECOMMENDED";
  position: absolute;
  top: -1px; right: 24px;
  transform: translateY(-50%);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  background: var(--accent);
  color: #06120c;
  padding: 4px 10px;
  border-radius: 3px;
  font-weight: 700;
}
.lp-page .price-card .plan-name{
  font-family: var(--font-mono);
  font-size: 12.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}
.lp-page .price-card h3{
  margin-top: 14px;
  font-size: 2.3rem;
  color: #fff;
}
.lp-page .price-card h3 small{
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted);
  margin-left: 6px;
}
.lp-page .price-card .desc{
  margin-top: 12px;
  color: var(--text-muted);
  font-size: 14.5px;
  line-height: 1.6;
}
.lp-page .price-list{
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}
.lp-page .price-list li{
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  color: var(--text-muted);
}
.lp-page .price-list svg{ width: 16px; height: 16px; color: var(--accent); flex: none; margin-top: 2px; }
.lp-page .price-card .btn{ margin-top: 30px; width: 100%; }

.lp-page .pricing-snippet{
  margin-top: 48px;
}


.lp-page .cta-band{
  position: relative;
  padding: 90px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  text-align: center;
}
.lp-page .cta-band::before{
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(230,232,230,0.14) 1px, transparent 1px);
  background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
}
.lp-page .cta-band .container{ position: relative; }
.lp-page .cta-band h2{
  font-size: clamp(2rem, 3.6vw, 3rem);
  color: #fff;
  max-width: 18ch;
  margin: 0 auto;
}
.lp-page .cta-band p{
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 16.5px;
}
.lp-page .cta-band .hero-ctas{ justify-content: center; margin-top: 32px; }


.lp-page footer{ padding: 72px 0 34px; background: var(--bg-alt); }
.lp-page .footer-top{
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 40px;
  padding-bottom: 52px;
  border-bottom: 1px solid var(--border);
}
.lp-page .footer-brand .brand{ margin-bottom: 14px; }
.lp-page .footer-brand p{
  color: var(--text-dim);
  font-size: 14px;
  max-width: 32ch;
  line-height: 1.6;
}
.lp-page .footer-col h4{
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 16px;
}
.lp-page .footer-col ul{ display: flex; flex-direction: column; gap: 11px; }
.lp-page .footer-col a{ font-size: 14px; color: var(--text-muted); transition: color .15s ease; }
.lp-page .footer-col a:hover{ color: var(--accent); }

.lp-page .footer-bottom{
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 28px;
}
.lp-page .footer-bottom p{ font-size: 13px; color: var(--text-dim); }
.lp-page .footer-badges{ display: flex; gap: 10px; flex-wrap: wrap; }


@media (max-width: 980px){
  .lp-page .hero .container{ grid-template-columns: 1fr; }
  .lp-page .hero-copy{ order: 1; }
  .lp-page .hero-visual{ order: 2; }
  .lp-page .feature-grid{ grid-template-columns: repeat(2, 1fr); }
  .lp-page .feature-card.wide{ grid-column: span 2; grid-template-columns: 1fr; }
  .lp-page .why-fork .container{ grid-template-columns: 1fr; }
  .lp-page .deploy-log{ position: static; }
  .lp-page .app-window-body{ grid-template-columns: 1fr; min-height: 0; }
  .lp-page .app-col{ border-right: none; border-bottom: 1px solid var(--border); }
  .lp-page .thread{ order: -1; }
  .lp-page .pricing-grid{ grid-template-columns: 1fr; }
  .lp-page .footer-top{ grid-template-columns: 1fr 1fr; row-gap: 36px; }
}

@media (max-width: 720px){
  .lp-page .container{ padding: 0 20px; }
  .lp-page section{ padding: 76px 0; }
  .lp-page .nav-links{ display: none; }
  .lp-page .nav-right .nav-login{ display: none; }
  .lp-page .nav-toggle{ display: flex; }
  .lp-page .hero{ padding: 56px 0 64px; }
  .lp-page .hero-ctas{ flex-direction: column; align-items: stretch; }
  .lp-page .hero-ctas .btn{ width: 100%; }
  .lp-page .feature-grid{ grid-template-columns: 1fr; }
  .lp-page .feature-card.wide{ grid-column: span 1; }
  .lp-page .terminal-stats{ grid-template-columns: 1fr; }
  .lp-page .terminal-stats > div{ border-right: none; border-bottom: 1px solid var(--border); }
  .lp-page .terminal-stats > div:last-child{ border-bottom: none; }
  .lp-page .footer-top{ grid-template-columns: 1fr; }
  .lp-page .cta-band .hero-ctas{ flex-direction: column; }
  .lp-page .cta-band .hero-ctas .btn{ width: 100%; }
  .lp-page .section-head{ padding: 0 4px; }
  .lp-page .terminal-body{ font-size: 12px; padding: 18px 16px 20px; }
  .lp-page .deploy-log .terminal-body{ font-size: 11.5px; }
}

`;

const LANDING_BODY_HTML = `

<!-- ============================= NAV ============================= -->
<nav class="site-nav">
  <div class="container">
    <a href="#top" class="brand">
      <img src="/logo-v2.png" alt="Repeat Grow" class="brand-mark" width="26" height="26">
      <span class="brand-word">Repeat<span class="dim">Grow</span></span>
    </a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#why-us">Why Us</a>
      <a href="#pricing">Pricing</a>
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
    <a href="#features">Features</a>
    <a href="#why-us">Why Us</a>
    <a href="#pricing">Pricing</a>
    <a href="#">Docs</a>
    <a href="/login">Login</a>
  </div>
</div>

<main id="top">

<!-- ============================= HERO ============================= -->
<header class="hero">
  <div class="container">
    <div class="hero-copy">
      <span class="eyebrow">Official WhatsApp Business API &middot; Done-for-you setup</span>
      <h1>Turn one-time chats into <span class="accent-text">repeat</span> customers.</h1>
      <p class="hero-sub">Repeat Grow is a WhatsApp CRM for sales and support teams — shared inbox, contacts, sales pipelines, broadcasts, and no-code automations, built on the official WhatsApp Business API. We set it up for your business, so your team is selling on WhatsApp in days.</p>
      <div class="hero-ctas">
        <a href="#how-it-works" class="btn btn-primary">See how it works</a>
      </div>
      <div class="hero-meta">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Official WhatsApp Business API</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Managed setup &amp; onboarding</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg> Dedicated support</span>
      </div>
    </div>

    <div class="hero-visual">
      <div class="terminal">
        <div class="terminal-bar">
          <div class="terminal-dots"><i></i><i></i><i></i></div>
          <span class="terminal-title">onboarding.log</span>
        </div>
        <div class="terminal-body" id="snippetText">
<span class="ln"><span class="comment"># connecting your WhatsApp Business number</span></span><span class="ln"><span class="prompt">$</span> <span class="cmd">Verifying WhatsApp Business API</span></span><span class="ln"><span class="prompt">$</span> <span class="cmd">Importing your contacts</span></span><span class="ln"><span class="prompt">$</span> <span class="cmd">Setting up your shared inbox</span></span><span class="ln"><span class="prompt">$</span> <span class="cmd">Configuring pipelines &amp; automations</span></span><span class="ln"><span class="out">&gt; Repeat Grow is live for your team</span><span class="cursor"></span></span>
        </div>
        <div class="terminal-stats">
          <div><div class="stat-num">100%</div><div class="stat-label">OFFICIAL API</div></div>
          <div><div class="stat-num">Managed</div><div class="stat-label">SETUP</div></div>
          <div><div class="stat-num">24/7</div><div class="stat-label">SUPPORT</div></div>
        </div>
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
    <div class="fork-copy">
      <div class="section-head left reveal">
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

    <div class="deploy-log reveal">
      <div class="terminal-bar">
        <div class="terminal-dots"><i></i><i></i><i></i></div>
        <span class="terminal-title">onboarding.log</span>
      </div>
      <div class="terminal-body">
<span class="ln"><span class="tag">[1/5]</span> Verifying your WhatsApp Business number<span class="ok"> ✓</span></span><span class="ln"><span class="tag">[2/5]</span> Importing your contacts<span class="ok"> ✓</span></span><span class="ln"><span class="tag">[3/5]</span> Setting up your shared inbox<span class="ok"> ✓</span></span><span class="ln"><span class="tag">[4/5]</span> Configuring pipelines &amp; automations<span class="ok"> ✓</span></span><span class="ln"><span class="tag">[5/5]</span> Training your team<span class="ok"> ✓</span></span><span class="ln"><span class="out">&gt; Repeat Grow is live for your business</span><span class="cursor"></span></span>
      </div>
      <div class="terminal-stats">
        <div><div class="stat-num">Days</div><div class="stat-label">TO GO LIVE</div></div>
        <div><div class="stat-num">0</div><div class="stat-label">TECH SETUP FOR YOU</div></div>
        <div><div class="stat-num">1</div><div class="stat-label">DEDICATED SPECIALIST</div></div>
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
        <div class="terminal-dots"><i></i><i></i><i></i></div>
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

<!-- ============================= PRICING ============================= -->
<section id="pricing" class="section-alt">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow">Pricing</span>
      <h2>Pricing that fits your business</h2>
      <p>Every team's WhatsApp volume and headcount is different, so we scope your plan instead of forcing you into a fixed tier. No hidden fees, no long-term lock-in.</p>
    </div>

    <div class="pricing-single reveal">
      <div class="price-card featured">
        <span class="plan-name mono">Repeat Grow</span>
        <h3>Custom plan</h3>
        <p class="desc">Tell us about your team and your WhatsApp volume, and we'll put together a plan that fits — with everything below included.</p>
        <ul class="price-list">
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Shared inbox, pipelines, broadcasts &amp; automations</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Official WhatsApp Business API setup, handled for you</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Onboarding &amp; training for your whole team</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Public REST API included</li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Ongoing support when you need it</li>
        </ul>
        <a href="mailto:support.repeatgrow@gmail.com?subject=Repeat%20Grow%20pricing" class="btn btn-primary">Email us for pricing &rarr;</a>
      </div>
    </div>
  </div>
</section>

<!-- ============================= FINAL CTA BAND ============================= -->
<section class="cta-band">
  <div class="container">
    <span class="eyebrow" style="justify-content:center;">Ready when you are</span>
    <h2 style="margin-top:18px;">Turn WhatsApp into your best sales channel.</h2>
    <p>Email us and we'll get your team set up on Repeat Grow — usually live within days.</p>
    <div class="hero-ctas">
      <a href="#pricing" class="btn btn-primary">See what's included</a>
    </div>
  </div>
</section>

</main>

<!-- ============================= FOOTER ============================= -->
<footer>
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <a href="#top" class="brand">
          <img src="/logo-v2.png" alt="Repeat Grow" class="brand-mark" width="26" height="26">
          <span class="brand-word">Repeat<span class="dim">Grow</span></span>
        </a>
        <p>WhatsApp CRM for sales and support teams — built on the official WhatsApp Business API, set up and supported for you.</p>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <ul>
          <li><a href="#features">Features</a></li>
          <li><a href="#why-us">Why Us</a></li>
          <li><a href="#pricing">Pricing</a></li>
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

const LANDING_SCRIPT = `
(function(){
  "use strict";

  // Mobile nav toggle
  var navToggle = document.getElementById('navToggle');
  var mobileNav = document.getElementById('mobileNav');
  if (navToggle && mobileNav) {
    navToggle.addEventListener('click', function(){
      var isOpen = mobileNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    mobileNav.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){
        mobileNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Scroll-reveal
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('is-visible'); });
  }
})();

`;

export default function Home() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="lp-page" dangerouslySetInnerHTML={{ __html: LANDING_BODY_HTML }} />
      <Script
        id="landing-page-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_SCRIPT }}
      />
    </>
  );
}
