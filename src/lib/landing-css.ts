// Shared stylesheet for the marketing site (/, /pricing). Scoped
// entirely under .lp-page so it never leaks into the dashboard app's
// Tailwind/shadcn styling, which shares the same document in dev.
export const LANDING_CSS = `
.lp-page{
  --bg: #ffffff;
  --bg-alt: #f3f7fb;
  --bg-elevated: #ffffff;
  --bg-elevated-2: #eef2f6;
  --text: #16212c;
  --text-muted: #4c5665;
  --text-dim: #6b7686;
  --accent: #0da968;
  --accent-2: #0b8f58;
  --accent-deep: #087a4a;
  --accent-soft: rgba(13,169,104,0.10);
  --accent-soft-strong: rgba(13,169,104,0.18);
  --border: #e6e9ee;
  --border-strong: #d8dce3;
  --border-accent: rgba(13,169,104,0.35);
  --danger: #dc4c3f;
  --amber: #f0b429;

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
  background: rgba(255,255,255,0.86);
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
  padding: 11px 22px;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: transform .12s ease, background .15s ease, border-color .15s ease, box-shadow .15s ease, color .15s ease;
  white-space: nowrap;
}
.lp-page .btn:active{ transform: translateY(1px); }

.lp-page .btn-primary{
  background: var(--accent);
  color: #fff;
  box-shadow: 0 8px 20px -8px rgba(13,169,104,0.55);
}
.lp-page .btn-primary:hover{
  background: var(--accent-2);
  box-shadow: 0 10px 26px -6px rgba(13,169,104,0.65);
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
  background: var(--bg-alt);
  border-bottom: 1px solid var(--border);
}
.lp-page .hero::before{
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(22,33,44,0.07) 1px, transparent 1px);
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
  background: radial-gradient(circle, rgba(13,169,104,0.16), transparent 68%);
  filter: blur(10px);
  pointer-events: none;
}
.lp-page .hero .container{
  position: relative;
}
.lp-page .hero-copy{ max-width: 640px; }

.lp-page .hero-copy, .lp-page .feature-card, .lp-page .price-card, .lp-page .app-col{
  min-width: 0;
}
.lp-page .hero-copy .eyebrow{ margin-bottom: 22px; }
.lp-page .hero h1{
  font-size: clamp(2.3rem, 4.1vw, 3.55rem);
  color: var(--text);
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
.lp-page .hero-note{
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-dim);
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
.lp-page .section-head h1, .lp-page .section-head h2{
  font-size: clamp(1.9rem, 3vw, 2.5rem);
  color: var(--text);
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


.lp-page .fork-list{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 36px 48px;
  margin-top: 8px;
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

.lp-page .app-window{
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-elevated);
  box-shadow: 0 30px 60px -30px rgba(22,33,44,0.18);
}
.lp-page .app-window-bar{
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated-2);
}
.lp-page .window-dots{ display: flex; gap: 7px; }
.lp-page .window-dots i{
  width: 10px; height: 10px; border-radius: 50%;
  display: block;
  background: var(--border-strong);
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
.lp-page .pricing-toggle{
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  margin: 0 auto 40px;
  padding: 5px;
  width: fit-content;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-alt);
}
.lp-page .cycle-btn{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 999px;
  padding: 9px 18px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.lp-page .cycle-btn.is-active{
  background: var(--accent);
  color: #fff;
}
.lp-page .cycle-btn .save-badge{
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255,255,255,0.22);
  color: #fff;
}
.lp-page .cycle-btn:not(.is-active) .save-badge{
  color: #7a5b00;
  background: var(--amber);
}
.lp-page .pricing-grid-3{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  align-items: stretch;
}
.lp-page .pricing-grid-3[hidden]{ display: none; }
.lp-page .price-card .price-period{
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-dim);
}
.lp-page .price-card .price-period .save{ color: var(--accent); }
.lp-page .price-card .price-note{
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.lp-page .price-card .limits{
  margin-top: 22px;
  padding-top: 22px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lp-page .price-card .limits li{
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--text-muted);
}
.lp-page .price-card .limits li b{
  color: var(--accent-2);
  font-weight: 700;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--accent-soft);
  padding: 2px 9px;
  border-radius: 999px;
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
  border-color: var(--accent);
  border-width: 2px;
  background: var(--bg-elevated);
  position: relative;
}
.lp-page .price-card.featured::before{
  content: "MOST POPULAR";
  position: absolute;
  top: -1px; left: -2px;
  font-family: var(--font-sans);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  background: var(--accent);
  color: #fff;
  padding: 5px 12px;
  border-radius: var(--radius-lg) 0 var(--radius-md) 0;
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
  color: var(--accent);
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
.lp-page .price-list svg{
  width: 14px; height: 14px;
  padding: 3px;
  box-sizing: content-box;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  flex: none;
}
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
  background-image: radial-gradient(circle, rgba(22,33,44,0.06) 1px, transparent 1px);
  background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
}
.lp-page .cta-band .container{ position: relative; }
.lp-page .cta-band h2{
  font-size: clamp(2rem, 3.6vw, 3rem);
  color: var(--text);
  max-width: 18ch;
  margin: 0 auto;
}
.lp-page .cta-band p{
  margin-top: 18px;
  color: var(--text-muted);
  font-size: 16.5px;
}
.lp-page .cta-band .hero-ctas{ justify-content: center; margin-top: 32px; }


.lp-page footer{ padding: 72px 0 34px; background: var(--accent-deep); }
.lp-page .footer-top{
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 40px;
  padding-bottom: 52px;
  border-bottom: 1px solid rgba(255,255,255,0.18);
}
.lp-page .footer-brand .brand{ margin-bottom: 14px; color: #fff; }
.lp-page .footer-brand p{
  color: rgba(255,255,255,0.72);
  font-size: 14px;
  max-width: 32ch;
  line-height: 1.6;
}
.lp-page .footer-col h4{
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.6);
  margin-bottom: 16px;
}
.lp-page .footer-col ul{ display: flex; flex-direction: column; gap: 11px; }
.lp-page .footer-col a{ font-size: 14px; color: rgba(255,255,255,0.85); transition: color .15s ease; }
.lp-page .footer-col a:hover{ color: #fff; }

.lp-page .footer-bottom{
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding-top: 28px;
}
.lp-page .footer-bottom p{ font-size: 13px; color: rgba(255,255,255,0.6); }
.lp-page .footer-badges{ display: flex; gap: 10px; flex-wrap: wrap; }
.lp-page .footer-badges .pill{ background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.24); color: rgba(255,255,255,0.85); }
.lp-page .footer-badges .pill svg{ color: #fff; }


@media (max-width: 980px){
  .lp-page .feature-grid{ grid-template-columns: repeat(2, 1fr); }
  .lp-page .feature-card.wide{ grid-column: span 2; grid-template-columns: 1fr; }
  .lp-page .fork-list{ grid-template-columns: 1fr; }
  .lp-page .app-window-body{ grid-template-columns: 1fr; min-height: 0; }
  .lp-page .app-col{ border-right: none; border-bottom: 1px solid var(--border); }
  .lp-page .thread{ order: -1; }
  .lp-page .pricing-grid{ grid-template-columns: 1fr; }
  .lp-page .pricing-grid-3{ grid-template-columns: 1fr; max-width: 480px; margin: 0 auto; }
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
  .lp-page .footer-top{ grid-template-columns: 1fr; }
  .lp-page .cta-band .hero-ctas{ flex-direction: column; }
  .lp-page .cta-band .hero-ctas .btn{ width: 100%; }
  .lp-page .section-head{ padding: 0 4px; }
}

`;
