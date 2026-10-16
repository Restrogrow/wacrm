// Home page only (src/app/page.tsx). Every selector is scoped under
// `.lp-page .home` so /pricing, /demo and /docs, which share LANDING_CSS,
// are untouched. Uses the brand tokens defined in LANDING_CSS.
export const HOME_CSS = `
.lp-page .home{
  --h-ink: #0b1620;
  --h-shadow-sm: 0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06);
  --h-shadow-md: 0 10px 30px -12px rgba(16,24,40,.18), 0 4px 10px -6px rgba(16,24,40,.08);
  --h-shadow-lg: 0 30px 70px -28px rgba(8,122,74,.35), 0 18px 40px -24px rgba(16,24,40,.25);
  --h-radius: 18px;
  --h-radius-sm: 12px;
  --h-wa-bg: #efeae2;
  --h-wa-out: #d9fdd3;
  overflow: hidden;
}
.lp-page .home section{ position: relative; }
.lp-page .home .h-section{ padding: 104px 0; }
.lp-page .home .h-alt{ background: var(--bg-alt); }

/* ---------- Shared type ---------- */
.lp-page .home .h-eyebrow{
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--accent-deep);
  padding: 6px 12px; border-radius: 999px;
  background: var(--accent-soft); border: 1px solid var(--border-accent);
}
.lp-page .home .h-head{ max-width: 760px; margin: 0 auto 56px; text-align: center; }
.lp-page .home .h-head h2{
  margin-top: 18px;
  font-size: clamp(30px, 4vw, 46px); letter-spacing: -0.03em; line-height: 1.08; color: var(--h-ink);
}
.lp-page .home .h-head p{ margin-top: 16px; font-size: 18px; color: var(--text-muted); line-height: 1.6; }
.lp-page .home .h-grad{
  background: linear-gradient(100deg, var(--accent) 0%, #12c47d 45%, var(--accent-deep) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  padding-right: .06em; margin-right: -.02em;
}

/* ---------- Buttons ---------- */
.lp-page .home .h-btn{ padding: 14px 24px; font-size: 15.5px; }
.lp-page .home .h-btn svg{ width: 16px; height: 16px; transition: transform .2s ease; }
.lp-page .home .h-btn:hover svg{ transform: translateX(3px); }
.lp-page .home .h-btn-glow{ position: relative; isolation: isolate; }
.lp-page .home .h-btn-glow::after{
  content: ""; position: absolute; inset: -3px; border-radius: inherit; z-index: -1;
  background: linear-gradient(120deg, rgba(13,169,104,.55), rgba(18,196,125,.15), rgba(13,169,104,.55));
  filter: blur(10px); opacity: .55; transition: opacity .25s ease;
  animation: h-glow 3.2s ease-in-out infinite;
}
.lp-page .home .h-btn-glow:hover::after{ opacity: .9; }
@keyframes h-glow{ 0%,100%{ opacity: .45; } 50%{ opacity: .8; } }
.lp-page .home .h-btn-ghost{ background: rgba(255,255,255,.7); backdrop-filter: blur(6px); }

/* ---------- Hero ---------- */
.lp-page .home .h-hero{ position: relative; padding: 72px 0 88px; }
.lp-page .home .h-hero-bg{
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(48rem 30rem at 85% 10%, rgba(13,169,104,.16), transparent 60%),
    radial-gradient(40rem 26rem at 5% 0%, rgba(18,196,125,.10), transparent 60%),
    linear-gradient(180deg, #f7fbf9 0%, #ffffff 70%);
}
.lp-page .home .h-hero-bg::after{
  content: ""; position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(22,33,44,.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(22,33,44,.045) 1px, transparent 1px);
  background-size: 44px 44px;
  -webkit-mask-image: radial-gradient(ellipse at 60% 20%, #000 20%, transparent 70%);
  mask-image: radial-gradient(ellipse at 60% 20%, #000 20%, transparent 70%);
}
.lp-page .home .h-hero-grid{
  position: relative; z-index: 1;
  display: grid; grid-template-columns: 1.02fr 1fr; gap: 56px; align-items: center;
}
.lp-page .home .h-badge{
  display: inline-flex; align-items: center; gap: 10px;
  padding: 5px 14px 5px 5px; border-radius: 999px;
  background: #fff; border: 1px solid var(--border); box-shadow: var(--h-shadow-sm);
  font-size: 13.5px; font-weight: 600; color: var(--text);
  transition: border-color .2s ease, box-shadow .2s ease;
}
.lp-page .home .h-badge:hover{ border-color: var(--border-accent); box-shadow: var(--h-shadow-md); }
.lp-page .home .h-badge-new{
  background: var(--accent); color: #fff; font-size: 11.5px; font-weight: 700;
  padding: 3px 9px; border-radius: 999px; letter-spacing: .02em;
}
.lp-page .home .h-hero h1{
  margin-top: 22px;
  font-size: clamp(40px, 5.4vw, 66px); line-height: 1.02; letter-spacing: -0.04em; color: var(--h-ink);
}
.lp-page .home .h-sub{ margin-top: 22px; font-size: 19px; line-height: 1.6; color: var(--text-muted); max-width: 34em; }
.lp-page .home .h-ctas{ margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
.lp-page .home .h-checks{ margin-top: 22px; display: flex; flex-wrap: wrap; gap: 8px 20px; }
.lp-page .home .h-checks li{ display: inline-flex; align-items: center; gap: 7px; font-size: 14px; color: var(--text-dim); font-weight: 500; }
.lp-page .home .h-checks svg{ width: 16px; height: 16px; color: var(--accent); flex: none; }

/* Device mockup */
.lp-page .home .h-hero-visual{ position: relative; }
.lp-page .home .h-device{
  position: relative; border-radius: 20px; background: #fff;
  border: 1px solid var(--border); box-shadow: var(--h-shadow-lg);
  overflow: hidden;
  transform: perspective(1600px) rotateY(-6deg) rotateX(2deg);
  transition: transform .6s cubic-bezier(.2,.7,.2,1);
}
.lp-page .home .h-hero-visual:hover .h-device{ transform: perspective(1600px) rotateY(-2deg) rotateX(0deg); }
.lp-page .home .h-device-bar{
  display: flex; align-items: center; gap: 10px; padding: 11px 14px;
  border-bottom: 1px solid var(--border); background: #fafbfc;
}
.lp-page .home .h-dots{ display: flex; gap: 6px; }
.lp-page .home .h-dots i{ width: 10px; height: 10px; border-radius: 50%; background: #e5e7eb; }
.lp-page .home .h-dots i:nth-child(1){ background: #ff5f57; }
.lp-page .home .h-dots i:nth-child(2){ background: #febc2e; }
.lp-page .home .h-dots i:nth-child(3){ background: #28c840; }
.lp-page .home .h-url{
  flex: 1; text-align: center; font-family: var(--font-mono); font-size: 12px; color: var(--text-dim);
  background: #fff; border: 1px solid var(--border); border-radius: 7px; padding: 4px 10px; margin-right: 46px;
}
.lp-page .home .h-stage{ position: relative; height: 430px; background: #fff; }
.lp-page .home .h-slide{
  position: absolute; inset: 0; opacity: 0; transform: scale(.985);
  transition: opacity .7s ease, transform .7s ease; pointer-events: none;
}
.lp-page .home .h-slide.is-active{ opacity: 1; transform: none; pointer-events: auto; }
.lp-page .home .h-slider-nav{ display: flex; justify-content: center; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
.lp-page .home .h-slider-nav button{
  border: 1px solid var(--border); background: #fff; color: var(--text-dim);
  font-size: 12.5px; font-weight: 600; padding: 7px 13px; border-radius: 999px;
  transition: all .2s ease;
}
.lp-page .home .h-slider-nav button:hover{ color: var(--text); border-color: var(--border-strong); }
.lp-page .home .h-slider-nav button[aria-selected="true"]{ background: var(--accent); border-color: var(--accent); color: #fff; }

/* Floating glass cards */
.lp-page .home .h-float{
  position: absolute; z-index: 3; display: flex; align-items: center; gap: 11px;
  padding: 11px 14px; border-radius: 14px;
  background: rgba(255,255,255,.82); backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
  border: 1px solid rgba(255,255,255,.9); box-shadow: var(--h-shadow-md);
  font-size: 13px; color: var(--text); white-space: nowrap;
  animation: h-float 6s ease-in-out infinite;
}
.lp-page .home .h-float b{ display: block; font-size: 13.5px; color: var(--h-ink); }
.lp-page .home .h-float span{ color: var(--text-dim); font-size: 12px; }
.lp-page .home .h-float .ic{
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none;
  background: var(--accent-soft); color: var(--accent-deep);
}
.lp-page .home .h-float .ic svg{ width: 18px; height: 18px; }
.lp-page .home .h-float.f1{ left: -34px; bottom: 54px; }
.lp-page .home .h-float.f2{ right: -26px; top: -52px; animation-delay: -3s; }
@keyframes h-float{ 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-8px); } }

/* ---------- Mini app UI (used in hero, bento and tour) ---------- */
.lp-page .home .ui-inbox{ display: grid; grid-template-columns: 38% 1fr; height: 100%; }
.lp-page .home .ui-list{ border-right: 1px solid var(--border); padding: 10px; display: flex; flex-direction: column; gap: 4px; background: #fbfcfd; }
.lp-page .home .ui-row{ display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 10px; }
.lp-page .home .ui-row.on{ background: var(--accent-soft); }
.lp-page .home .ui-av{
  width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; flex: none;
  color: #fff; font-size: 11px; font-weight: 700;
}
.lp-page .home .ui-row .t{ min-width: 0; flex: 1; }
.lp-page .home .ui-row .n{ font-size: 12.5px; font-weight: 700; color: var(--h-ink); }
.lp-page .home .ui-row .p{ font-size: 11.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lp-page .home .ui-row .tag{ font-size: 10px; font-weight: 700; color: var(--accent-deep); background: #fff; border: 1px solid var(--border-accent); border-radius: 999px; padding: 1px 7px; }
.lp-page .home .ui-thread{
  position: relative; display: flex; flex-direction: column; gap: 8px; padding: 14px;
  background: var(--h-wa-bg);
  background-image: radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px); background-size: 14px 14px;
}
.lp-page .home .ui-thread.full{ height: 100%; }
.lp-page .home .ui-thread > *{ flex-shrink: 0; }
.lp-page .home .ui-b{
  max-width: 82%; padding: 8px 11px; border-radius: 10px; font-size: 12.5px; line-height: 1.45; color: #111b21;
  background: #fff; box-shadow: 0 1px 1px rgba(0,0,0,.06); align-self: flex-start;
}
.lp-page .home .ui-b.out{ background: var(--h-wa-out); align-self: flex-end; }
.lp-page .home .ui-b small{ display: block; margin-top: 3px; font-size: 10px; color: #667781; text-align: right; }
.lp-page .home .ui-b .who{ display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: var(--accent-deep); margin-bottom: 2px; }
.lp-page .home .ui-typing{ display: inline-flex; gap: 4px; padding: 10px 12px; }
.lp-page .home .ui-typing i{ width: 6px; height: 6px; border-radius: 50%; background: #8696a0; animation: h-typing 1.2s infinite ease-in-out; }
.lp-page .home .ui-typing i:nth-child(2){ animation-delay: .15s; }
.lp-page .home .ui-typing i:nth-child(3){ animation-delay: .3s; }
@keyframes h-typing{ 0%,60%,100%{ opacity: .3; transform: translateY(0); } 30%{ opacity: 1; transform: translateY(-3px); } }
.lp-page .home .ui-chips{ display: flex; gap: 6px; flex-wrap: wrap; align-self: flex-start; }
.lp-page .home .ui-chip{ font-size: 11.5px; font-weight: 600; color: #027eb5; background: #fff; border-radius: 999px; padding: 5px 10px; box-shadow: 0 1px 1px rgba(0,0,0,.06); }
.lp-page .home .ui-composer{
  margin-top: auto; display: flex; align-items: center; gap: 8px; background: #fff; border-radius: 999px;
  padding: 8px 8px 8px 14px; font-size: 12px; color: #8696a0;
}
.lp-page .home .ui-composer > span:first-child{ flex: 1; }
.lp-page .home .ui-send{ flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; color: #fff; }
.lp-page .home .ui-send svg{ width: 14px; height: 14px; }
.lp-page .home .ui-order{ background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.08); align-self: flex-end; width: 74%; font-size: 12.5px; }
.lp-page .home .ui-order .hd{ padding: 10px 12px 6px; font-weight: 700; color: var(--h-ink); }
.lp-page .home .ui-order .ln{ display: flex; justify-content: space-between; padding: 3px 12px; color: #54656f; }
.lp-page .home .ui-order .tot{ display: flex; justify-content: space-between; padding: 8px 12px; font-weight: 700; color: var(--h-ink); border-top: 1px solid #eef0f2; margin-top: 6px; }
.lp-page .home .ui-order .pay{ display: block; text-align: center; padding: 9px; color: #027eb5; font-weight: 700; border-top: 1px solid #eef0f2; }
.lp-page .home .ui-paid{ align-self: center; font-size: 11.5px; font-weight: 700; color: var(--accent-deep); background: #fff; border-radius: 999px; padding: 5px 12px; box-shadow: 0 1px 1px rgba(0,0,0,.06); }
.lp-page .home .ui-camp{ padding: 22px; height: 100%; display: flex; flex-direction: column; gap: 16px; }
.lp-page .home .ui-camp-hd{ display: flex; justify-content: space-between; align-items: center; }
.lp-page .home .ui-camp-hd b{ font-size: 15px; color: var(--h-ink); }
.lp-page .home .ui-pill{ font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-deep); }
.lp-page .home .ui-bars{ display: grid; gap: 12px; }
.lp-page .home .ui-bar{ display: grid; grid-template-columns: 80px 1fr 52px; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-muted); }
.lp-page .home .ui-bar .tr{ height: 10px; border-radius: 999px; background: #eef2f6; overflow: hidden; }
.lp-page .home .ui-bar .fl{ height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), #12c47d); transform-origin: left; animation: h-grow 1.4s cubic-bezier(.2,.7,.2,1) both; }
.lp-page .home .ui-bar b{ text-align: right; color: var(--h-ink); font-size: 12.5px; }
@keyframes h-grow{ from{ transform: scaleX(0); } to{ transform: scaleX(1); } }
.lp-page .home .ui-tpl{ border: 1px solid var(--border); border-radius: 12px; padding: 12px; font-size: 12.5px; color: var(--text-muted); background: #fbfcfd; line-height: 1.5; }
.lp-page .home .ui-tpl b{ color: var(--h-ink); }
.lp-page .home .ui-flow{ display: flex; flex-direction: column; align-items: center; gap: 0; padding: 18px; }
.lp-page .home .ui-node{
  display: flex; align-items: center; gap: 10px; width: min(100%, 300px);
  padding: 10px 12px; border-radius: 12px; background: #fff; border: 1px solid var(--border);
  box-shadow: var(--h-shadow-sm); font-size: 12.5px; color: var(--h-ink); font-weight: 600;
}
.lp-page .home .ui-node small{ display: block; font-weight: 500; color: var(--text-dim); font-size: 11.5px; }
.lp-page .home .ui-node .k{ width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex: none; font-size: 13px; }
.lp-page .home .ui-link{ width: 2px; height: 18px; background: repeating-linear-gradient(var(--border-accent) 0 4px, transparent 4px 8px); }
.lp-page .home .ui-kanban{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 14px; }
.lp-page .home .ui-col{ background: #f6f8fa; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.lp-page .home .ui-col > span{ font-size: 10.5px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: .05em; }
.lp-page .home .ui-deal{ background: #fff; border-radius: 8px; padding: 7px 8px; font-size: 11.5px; box-shadow: var(--h-shadow-sm); color: var(--h-ink); font-weight: 600; }
.lp-page .home .ui-deal small{ display: block; color: var(--accent-deep); font-weight: 700; }
.lp-page .home .ui-call{ display: grid; place-items: center; padding: 18px; }
.lp-page .home .ui-ring{ position: relative; width: 74px; height: 74px; display: grid; place-items: center; }
.lp-page .home .ui-ring::before, .lp-page .home .ui-ring::after{
  content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--accent);
  animation: h-ring 2.2s ease-out infinite; opacity: 0;
}
.lp-page .home .ui-ring::after{ animation-delay: 1.1s; }
@keyframes h-ring{ 0%{ transform: scale(.7); opacity: .7; } 100%{ transform: scale(1.6); opacity: 0; } }
.lp-page .home .ui-ring .ui-av{ width: 58px; height: 58px; font-size: 18px; position: relative; z-index: 1; }
.lp-page .home .ui-call-btns{ display: flex; gap: 8px; margin-top: 14px; }
.lp-page .home .ui-call-btns span{ font-size: 12px; font-weight: 700; padding: 7px 14px; border-radius: 999px; }
.lp-page .home .ui-call-btns .ok{ background: var(--accent); color: #fff; }
.lp-page .home .ui-call-btns .no{ background: #f1f3f5; color: var(--text-muted); }
.lp-page .home .ui-code{
  background: #0f1720; color: #c9d4df; border-radius: 12px; padding: 14px 16px;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.7; overflow: hidden; white-space: pre;
}
.lp-page .home .ui-code .k{ color: #7ee2b8; }
.lp-page .home .ui-code .s{ color: #f6c177; }
.lp-page .home .ui-code .c{ color: #6b7a89; }

/* ---------- Proof strip ---------- */
.lp-page .home .h-proof{ padding: 0 0 72px; }
.lp-page .home .h-stats{
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: #fff; border: 1px solid var(--border); border-radius: var(--h-radius); box-shadow: var(--h-shadow-md);
}
.lp-page .home .h-stat{ padding: 24px 26px; }
.lp-page .home .h-stat + .h-stat{ border-left: 1px solid var(--border); }
.lp-page .home .h-stat b{ display: block; font-size: 28px; letter-spacing: -0.03em; color: var(--h-ink); }
.lp-page .home .h-stat span{ display: block; margin-top: 4px; font-size: 14px; color: var(--text-dim); }
.lp-page .home .h-marquee{
  margin-top: 36px; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
}
.lp-page .home .h-marquee-label{ text-align: center; font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 16px; }
.lp-page .home .h-marquee-track{ display: flex; gap: 14px; width: max-content; animation: h-marquee 38s linear infinite; }
.lp-page .home .h-marquee:hover .h-marquee-track{ animation-play-state: paused; }
.lp-page .home .h-logo{
  display: inline-flex; align-items: center; gap: 9px; padding: 10px 18px; border-radius: 999px;
  background: #fff; border: 1px solid var(--border); font-weight: 700; font-size: 14.5px; color: var(--text-muted);
}
.lp-page .home .h-logo i{ width: 10px; height: 10px; border-radius: 3px; background: var(--c, var(--accent)); }
@keyframes h-marquee{ from{ transform: translateX(0); } to{ transform: translateX(-50%); } }

/* ---------- Bento ---------- */
.lp-page .home .h-bento{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.lp-page .home .h-card{
  position: relative; display: flex; flex-direction: column;
  background: #fff; border: 1px solid var(--border); border-radius: var(--h-radius);
  box-shadow: var(--h-shadow-sm); overflow: hidden;
  transition: transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease, border-color .35s ease;
}
.lp-page .home .h-card:hover{ transform: translateY(-5px); box-shadow: var(--h-shadow-lg); border-color: var(--border-accent); }
.lp-page .home .h-card.w2{ grid-column: span 2; }
.lp-page .home .h-card.w3{ grid-column: span 3; }
.lp-page .home .h-card-visual{
  position: relative; min-height: 200px;
  background:
    radial-gradient(22rem 12rem at 80% 0%, rgba(13,169,104,.10), transparent 70%),
    linear-gradient(180deg, #f7faf9, #f2f6f9);
  border-bottom: 1px solid var(--border);
}
.lp-page .home .h-card-visual{ overflow: hidden; }
.lp-page .home .h-card-visual::after{
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 46px; pointer-events: none;
  background: linear-gradient(180deg, rgba(242,246,249,0), rgba(242,246,249,.95));
}
.lp-page .home .h-card.w3 .h-card-visual::after{ display: none; }
.lp-page .home .h-card-visual > .ui-call{ height: 100%; align-content: center; }
.lp-page .home .h-card-visual .ui-camp{ padding: 16px 18px; gap: 12px; }
.lp-page .home .h-card-visual .ui-tpl{ padding: 9px 11px; }
.lp-page .home .h-card-visual .ui-flow{ padding: 14px; }
.lp-page .home .h-card-visual .ui-node{ padding: 8px 11px; }
.lp-page .home .h-card-visual .ui-link{ height: 12px; }
.lp-page .home .h-card-body{ padding: 22px 24px 26px; }
.lp-page .home .h-card-body h3{ font-size: 19px; color: var(--h-ink); letter-spacing: -0.02em; }
.lp-page .home .h-card-body p{ margin-top: 8px; font-size: 14.5px; color: var(--text-muted); line-height: 1.6; }
.lp-page .home .h-card-tag{ display: inline-block; margin-bottom: 10px; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent-deep); }
.lp-page .home .h-card.w3 .h-wide{ display: grid; grid-template-columns: 1fr 1.1fr; align-items: center; }
.lp-page .home .h-card.w3 .h-card-visual{ border-bottom: 0; border-left: 1px solid var(--border); min-height: 100%; padding: 24px; display: grid; align-items: center; order: 2; }
.lp-page .home .h-card.w3 .h-card-body{ padding: 34px 36px; }
.lp-page .home .h-int-badges{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.lp-page .home .h-int-badges span{ font-size: 12.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-deep); }
.lp-page .home .h-more{ margin-top: 28px; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.lp-page .home .h-more span{
  display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: var(--text);
  padding: 9px 15px; border-radius: 999px; background: #fff; border: 1px solid var(--border); box-shadow: var(--h-shadow-sm);
}
.lp-page .home .h-more svg{ width: 15px; height: 15px; color: var(--accent); }

/* ---------- Tour (tabs) ---------- */
.lp-page .home .h-tour{ display: grid; grid-template-columns: .9fr 1.25fr; gap: 40px; align-items: center; }
.lp-page .home .h-tabs{ display: flex; flex-direction: column; gap: 8px; }
.lp-page .home .h-tab{
  position: relative; text-align: left; border: 1px solid transparent; background: transparent;
  padding: 18px 20px; border-radius: 14px; overflow: hidden;
  transition: background .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.lp-page .home .h-tab:hover{ background: rgba(255,255,255,.7); }
.lp-page .home .h-tab b{ display: flex; align-items: center; gap: 10px; font-size: 17px; color: var(--h-ink); }
.lp-page .home .h-tab b i{ width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: #fff; border: 1px solid var(--border); font-style: normal; font-size: 15px; }
.lp-page .home .h-tab p{ margin-top: 6px; padding-left: 40px; font-size: 14.5px; color: var(--text-muted); line-height: 1.55; display: none; }
.lp-page .home .h-tab[aria-selected="true"]{ background: #fff; border-color: var(--border); box-shadow: var(--h-shadow-md); }
.lp-page .home .h-tab[aria-selected="true"] p{ display: block; }
.lp-page .home .h-tab[aria-selected="true"] b i{ background: var(--accent-soft); border-color: var(--border-accent); }
.lp-page .home .h-tab .h-prog{ position: absolute; left: 0; bottom: 0; height: 3px; width: 0; background: var(--accent); }
.lp-page .home .h-tab[aria-selected="true"] .h-prog.run{ animation: h-prog 7s linear forwards; }
@keyframes h-prog{ from{ width: 0; } to{ width: 100%; } }
.lp-page .home .h-panels{ position: relative; }
.lp-page .home .h-panel-frame{
  position: relative; border-radius: 20px; overflow: hidden; background: #fff;
  border: 1px solid var(--border); box-shadow: var(--h-shadow-lg); min-height: 440px;
}
.lp-page .home .h-panel{ position: absolute; inset: 0; opacity: 0; transform: translateY(10px); transition: opacity .5s ease, transform .5s ease; pointer-events: none; }
.lp-page .home .h-panel.is-active{ opacity: 1; transform: none; pointer-events: auto; }
.lp-page .home .h-panel .ui-camp, .lp-page .home .h-panel .ui-flow{ padding: 28px; }

/* ---------- Steps ---------- */
.lp-page .home .h-steps{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; counter-reset: s; }
.lp-page .home .h-step{
  position: relative; padding: 30px 28px; border-radius: var(--h-radius); background: #fff;
  border: 1px solid var(--border); box-shadow: var(--h-shadow-sm);
}
.lp-page .home .h-step .n{
  width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--accent), #12c47d); color: #fff; font-weight: 800; font-size: 18px;
  box-shadow: 0 10px 20px -10px rgba(13,169,104,.8);
}
.lp-page .home .h-step h3{ margin-top: 18px; font-size: 19px; color: var(--h-ink); }
.lp-page .home .h-step p{ margin-top: 8px; font-size: 14.5px; color: var(--text-muted); line-height: 1.6; }
.lp-page .home .h-step:not(:last-child)::after{
  content: ""; position: absolute; top: 52px; right: -21px; width: 22px; height: 2px;
  background: repeating-linear-gradient(90deg, var(--border-accent) 0 5px, transparent 5px 9px);
}

/* ---------- Integrations, why, use cases, guides ---------- */
.lp-page .home .h-grid3{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.lp-page .home .h-grid2{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.lp-page .home .h-tile{
  display: block; padding: 28px; border-radius: var(--h-radius); background: #fff;
  border: 1px solid var(--border); box-shadow: var(--h-shadow-sm);
  transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s ease, border-color .3s ease;
}
.lp-page .home a.h-tile:hover, .lp-page .home .h-tile.hov:hover{ transform: translateY(-4px); box-shadow: var(--h-shadow-md); border-color: var(--border-accent); }
.lp-page .home .h-tile .ico{
  width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; margin-bottom: 18px;
  background: var(--accent-soft); color: var(--accent-deep); border: 1px solid var(--border-accent);
}
.lp-page .home .h-tile .ico svg{ width: 22px; height: 22px; }
.lp-page .home .h-tile .ico.logo{ font-weight: 800; font-size: 18px; color: #fff; border: 0; }
.lp-page .home .h-tile h3{ font-size: 18px; color: var(--h-ink); letter-spacing: -0.02em; }
.lp-page .home .h-tile p{ margin-top: 8px; font-size: 14.5px; color: var(--text-muted); line-height: 1.6; }
.lp-page .home .h-tile .more{ display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; font-size: 14px; font-weight: 700; color: var(--accent-deep); white-space: nowrap; }
.lp-page .home .h-tile .more svg{ width: 15px; height: 15px; flex: none; transition: transform .2s ease; }
.lp-page .home a.h-tile:hover .more svg{ transform: translateX(3px); }
.lp-page .home .h-tile .cat{ display: inline-block; margin-bottom: 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent-deep); }
.lp-page .home .h-why .h-tile{ background: rgba(255,255,255,.75); backdrop-filter: blur(8px); }

/* ---------- Pricing teaser ---------- */
.lp-page .home .h-plans{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 900px; margin: 0 auto; }
.lp-page .home .h-plan{ text-align: center; padding: 26px 20px; border-radius: var(--h-radius); background: #fff; border: 1px solid var(--border); box-shadow: var(--h-shadow-sm); }
.lp-page .home .h-plan.pop{ border-color: var(--accent); box-shadow: var(--h-shadow-lg); position: relative; }
.lp-page .home .h-plan.pop::before{
  content: "Most popular"; position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  font-size: 11.5px; font-weight: 700; color: #fff; background: var(--accent); padding: 4px 12px; border-radius: 999px;
}
.lp-page .home .h-plan span{ font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); }
.lp-page .home .h-plan b{ display: block; margin-top: 8px; font-size: 34px; letter-spacing: -0.03em; color: var(--h-ink); }
.lp-page .home .h-plan b small{ font-size: 14px; font-weight: 600; color: var(--text-dim); letter-spacing: 0; }
.lp-page .home .h-plan p{ margin-top: 6px; font-size: 13.5px; color: var(--text-muted); }
.lp-page .home .h-plans-note{ margin-top: 26px; text-align: center; font-size: 15px; color: var(--text-muted); }
.lp-page .home .h-center{ margin-top: 30px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }

/* ---------- FAQ ---------- */
.lp-page .home .h-faq{ display: grid; grid-template-columns: .8fr 1.2fr; gap: 56px; align-items: start; }
.lp-page .home .h-faq-side h2{ margin-top: 18px; font-size: clamp(30px, 3.6vw, 42px); letter-spacing: -0.03em; color: var(--h-ink); line-height: 1.1; }
.lp-page .home .h-faq-side p{ margin-top: 14px; font-size: 16px; color: var(--text-muted); line-height: 1.6; }
.lp-page .home .h-faq-side .btn{ margin-top: 24px; }
.lp-page .home .h-faq .faq-list{ max-width: none; margin: 0; }
.lp-page .home .h-faq .faq-item{ background: #fff; border-radius: 14px; box-shadow: var(--h-shadow-sm); }

/* ---------- Final CTA ---------- */
.lp-page .home .h-final{ padding: 40px 0 110px; }
.lp-page .home .h-final-box{
  position: relative; overflow: hidden; border-radius: 28px; padding: 72px 40px; text-align: center; color: #fff;
  background:
    radial-gradient(40rem 22rem at 15% 0%, rgba(18,196,125,.55), transparent 60%),
    radial-gradient(36rem 20rem at 100% 100%, rgba(13,169,104,.55), transparent 60%),
    linear-gradient(135deg, #064d30 0%, #087a4a 45%, #0b8f58 100%);
  box-shadow: 0 40px 80px -40px rgba(8,122,74,.7);
}
.lp-page .home .h-final-box::before{
  content: ""; position: absolute; inset: 0; opacity: .18;
  background-image: radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px); background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
}
.lp-page .home .h-final-box > *{ position: relative; }
.lp-page .home .h-final-box h2{ font-size: clamp(32px, 4.6vw, 54px); letter-spacing: -0.035em; line-height: 1.05; color: #fff; max-width: 820px; margin: 0 auto; }
.lp-page .home .h-final-box p{ margin: 18px auto 0; max-width: 620px; font-size: 18px; line-height: 1.6; color: rgba(255,255,255,.86); }
.lp-page .home .h-final-box .h-ctas{ justify-content: center; }
.lp-page .home .h-btn-white{ background: #fff; color: var(--accent-deep); box-shadow: 0 14px 30px -14px rgba(0,0,0,.45); }
.lp-page .home .h-btn-white:hover{ background: #f0fff7; }
.lp-page .home .h-btn-line{ background: transparent; color: #fff; border-color: rgba(255,255,255,.5); }
.lp-page .home .h-btn-line:hover{ border-color: #fff; color: #fff; background: rgba(255,255,255,.08); }
.lp-page .home .h-guarantee{ margin-top: 26px; display: flex; justify-content: center; flex-wrap: wrap; gap: 10px 22px; }
.lp-page .home .h-guarantee span{ display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,.9); }
.lp-page .home .h-guarantee svg{ width: 16px; height: 16px; }

/* ---------- Motion ---------- */
.lp-page .home .reveal{ transition-delay: calc(var(--d, 0) * 80ms); }

/* ---------- Responsive ---------- */
@media (max-width: 1080px){
  .lp-page .home .h-hero-grid{ grid-template-columns: 1fr; gap: 64px; }
  .lp-page .home .h-hero-copy{ text-align: center; }
  .lp-page .home .h-sub{ margin-left: auto; margin-right: auto; }
  .lp-page .home .h-ctas, .lp-page .home .h-checks{ justify-content: center; }
  .lp-page .home .h-hero-visual{ max-width: 640px; margin: 0 auto; width: 100%; }
  .lp-page .home .h-device{ transform: none; }
  .lp-page .home .h-tour{ grid-template-columns: 1fr; }
  .lp-page .home .h-faq{ grid-template-columns: 1fr; gap: 28px; }
}
@media (max-width: 900px){
  .lp-page .home .h-section{ padding: 80px 0; }
  .lp-page .home .h-bento{ grid-template-columns: 1fr 1fr; }
  .lp-page .home .h-card.w2, .lp-page .home .h-card.w3{ grid-column: span 2; }
  .lp-page .home .h-card.w3 .h-wide{ grid-template-columns: 1fr; }
  .lp-page .home .h-card.w3 .h-card-visual{ order: 0; border-left: 0; border-bottom: 1px solid var(--border); }
  .lp-page .home .h-stats{ grid-template-columns: 1fr 1fr; }
  .lp-page .home .h-stat:nth-child(3){ border-left: 0; }
  .lp-page .home .h-stat:nth-child(n+3){ border-top: 1px solid var(--border); }
  .lp-page .home .h-steps, .lp-page .home .h-grid3, .lp-page .home .h-plans{ grid-template-columns: 1fr; }
  .lp-page .home .h-step::after{ display: none; }
  .lp-page .home .h-grid2{ grid-template-columns: 1fr; }
}
@media (max-width: 640px){
  .lp-page .home .h-hero{ padding: 44px 0 64px; }
  .lp-page .home .h-sub{ font-size: 17px; }
  .lp-page .home .h-ctas .btn{ width: 100%; }
  .lp-page .home .h-bento{ grid-template-columns: 1fr; }
  .lp-page .home .h-card.w2, .lp-page .home .h-card.w3{ grid-column: span 1; }
  .lp-page .home .h-stage{ height: 380px; }
  .lp-page .home .ui-inbox{ grid-template-columns: 1fr; }
  .lp-page .home .ui-list{ display: none; }
  .lp-page .home .h-float{ display: none; }
  .lp-page .home .h-final-box{ padding: 56px 22px; border-radius: 22px; }
  .lp-page .home .h-panel-frame{ min-height: 400px; }
}
@media (prefers-reduced-motion: reduce){
  .lp-page .home *, .lp-page .home *::before, .lp-page .home *::after{
    animation: none !important; transition: none !important;
  }
  .lp-page .home .h-marquee-track{ flex-wrap: wrap; width: auto; justify-content: center; }
  .lp-page .home .h-marquee-track .dup{ display: none !important; }
}
`;
