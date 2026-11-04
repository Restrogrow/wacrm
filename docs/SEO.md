# SEO report and plan

Owner-facing. Last reviewed **2026-11-05**.

Supersedes the "SEO and content plan" section that lived in `TODO.md`.

---

## 0. Read this first: what is NOT in here

**There are no search volumes in this document.** Keyword volume, CPC
and difficulty come from Google Keyword Planner / Ahrefs / Semrush, and
nobody has pulled them for this project yet. Every keyword below is
grouped by *intent* and by reasoning about the market — not by measured
demand.

That matters because intent and volume disagree often enough to waste a
quarter. `whatsapp crm nepal` is obviously relevant and might get 30
searches a month; `whatsapp business api price` is less specific and
might get 10,000. Ranking effort should follow the numbers, and the
numbers do not exist yet.

**Owner task, blocking the priority order below:** open Keyword Planner
(free with any Google Ads account, no spend needed), set location to
India, then to Nepal, paste the clusters from §3, and write the volumes
into this file. Until then treat the priority column as a hypothesis.

---

## 1. Where we stand

Done and verified in the codebase:

| | |
|---|---|
| Indexable marketing pages | `/`, `/pricing`, `/demo`, `/partners`, `/about`, `/contact`, 3 industry pages, 4 competitor/comparison pages, `/docs`, `/docs/api`, legal pages |
| Blog | 11 posts, static + DB-backed, in the sitemap with real `lastmod` |
| Structured data | Organization, WebSite, FAQ schema, breadcrumbs, article schema per post |
| Crawl control | `robots.ts` with a private-path denylist, AI-crawler rules, `llms.txt` |
| Sitemap | `sitemap.ts`, static pages + blog, real last-changed dates (not `now()`) |
| Social cards | Per-post generated OG images, `twitter-image`, site-level `opengraph-image` |
| Icons | `favicon.ico` 48×48, `icon.png` 256×256, `apple-icon.png` 180×180, manifest icons incl. 512 |
| Analytics | GA4 `G-L56ZRQGJ67` |
| Canonical host | `www` → apex forced at the edge in `proxy.ts` (was causing duplicate indexing) |

### A trap that has already bitten twice

`robots.ts` (`PRIVATE_PATHS`) and `proxy.ts` (`protectedPaths`) both
match paths as **prefixes**. The entry `"/partner"` silently covered the
public `/partners` page: robots told Google not to crawl it, and the
proxy redirected every visitor to `/login`. Both are fixed, and
`src/proxy.test.ts` now asserts the marketing pages stay public.

**Any new public page whose path begins like a private one must be
checked against both lists.** There is no warning when this goes wrong —
the page simply never ranks.

---

## 2. The Nepal question — answered honestly

Short version: **ranking in Nepal is cheap. Converting Nepal traffic is
blocked by the product, not by SEO.** Doing the SEO first buys
impressions that cannot become customers.

### What blocks it today

| Blocker | Evidence | Impact |
|---|---|---|
| **No NPR currency** | `src/lib/currency.ts` — `CURRENCIES` has exactly one entry, `INR`. `DEFAULT_CURRENCY = "INR"` | A Nepali store cannot price in NPR. Order totals inside WhatsApp messages render as ₹, to a customer paying in रु |
| **Payments are India-only** | `src/lib/payments/razorpay.ts` hardcodes `currency: 'INR'`. Razorpay needs an Indian entity and bank account | A Nepali merchant cannot collect payment through the product at all. eSewa / Khalti / Fonepay / ConnectIPS are the rails there, and none are supported |
| **Every schema signal says India** | `src/lib/seo.ts`: `areaServed: { Country: "India" }`, `areaServed: "IN"`, `inLanguage: "en-IN"` | We are actively telling Google this is an India-only business |
| **Plan pricing is ₹-only** | `src/lib/billing/plans.ts` | A Nepali visitor on `/pricing` has to do FX maths to understand the offer |

### One market fact to verify before investing

WhatsApp's dominance in Nepal is **not** comparable to India.
Viber has historically held very strong consumer penetration in Nepal,
to the point where many Nepali businesses treat Viber as the default
chat channel. I cannot verify current 2026 share from here, and the
whole Nepal thesis rests on it.

**Owner task:** check current Nepal messenger share (StatCounter, or
simply ask five Nepali businesses which app their customers message
them on) *before* building NPR support for an SEO reason. If Viber still
leads, the honest answer is that Nepal is a smaller opportunity than it
looks and the effort belongs in India tier-2 instead.

### Recommended sequence

1. **Verify the market fact above.** Cheap, and it decides everything else.
2. **If it checks out — ship NPR first.** Add `NPR` to `CURRENCIES`,
   show `/pricing` in NPR for Nepali visitors, and widen `areaServed` to
   `["IN", "NP"]`. Without this, step 3 is wasted.
3. **Then the SEO**: a `/whatsapp-crm-nepal` landing page, the Nepal
   keyword cluster (§3.2), and `hreflang` (§4).
4. **Payments last**, and only if real Nepali demand shows up — eSewa /
   Khalti is a proper integration, not a config flag.

### What is safe to do now, before NPR

Nothing in the Nepal cluster needs NPR to be *written* — only to
convert. If you want Nepal coverage on the board immediately, the
honest version is a single page that says what the product does and
does not do for Nepal (works for messaging; billing in INR today). That
earns trust instead of bouncing people at `/pricing`.

---

## 3. Keyword plan

Grouped by intent. **No volumes — see §0.** "Priority" is a hypothesis
to be replaced with measured demand.

### 3.1 India

#### Tier A — commercial intent, we have a page or nearly do

| Cluster | Example terms | Target page | Status |
|---|---|---|---|
| Direct product | `whatsapp crm`, `whatsapp crm india`, `whatsapp crm software` | `/` | Live |
| API access | `whatsapp business api`, `whatsapp business api india`, `official whatsapp api provider` | `/`, `/official-vs-unofficial-whatsapp-api` | Live |
| Competitor swaps | `wati alternative`, `interakt alternative`, `aisensy alternative`, `wati vs interakt` | 4 comparison pages | Live |
| Pricing | `whatsapp business api pricing india`, `whatsapp api price per message`, `whatsapp marketing cost` | `/pricing`, blog post (blocked, §5) | **Gap** |
| Bulk sending | `bulk whatsapp sender`, `whatsapp broadcast software`, `bulk whatsapp message india` | None | **Gap — high intent** |
| Green tick | `whatsapp green tick`, `whatsapp blue tick verification`, `whatsapp business verification india` | None | **Gap** |

#### Tier B — problem-aware, blog territory

| Cluster | Example terms | Status |
|---|---|---|
| Cart recovery | `abandoned cart recovery whatsapp`, `whatsapp abandoned cart india`, `shopify abandoned cart whatsapp` | ✅ `/blog/abandoned-cart-recovery-whatsapp-india` |
| Order notifications | `shopify whatsapp order notification`, `whatsapp order confirmation message` | ✅ `/blog/shopify-whatsapp-order-notifications` |
| COD / RTO | `cod confirmation whatsapp`, `reduce rto shopify india`, `cod order confirmation message` | **Gap — strong D2C pain** |
| Ban risk | `whatsapp bulk message without ban`, `whatsapp number banned marketing`, `whatsapp quality rating` | **Gap** |
| Templates | `whatsapp marketing template examples`, `whatsapp template approved samples` | Partly (Diwali, broadcast rules) |
| Consent / law | `dpdp act whatsapp marketing`, `whatsapp marketing consent india` | **Gap — pairs with the cart post** |
| Chatbot | `whatsapp chatbot india`, `whatsapp chatbot without code` | **Gap** |
| Click-to-WhatsApp ads | `click to whatsapp ads`, `ctwa leads crm` | **Gap** |

#### Tier C — vertical long tail

`whatsapp crm for real estate` (live), `for education` (live), `for ecommerce` (live),
and unaddressed: `for restaurants`, `for clinics / doctors`, `for salons`,
`for coaching institutes`, `for travel agency`.

Each is a thin page with the same skeleton and vertical-specific
templates. Cheap to produce; only worth doing once volumes justify it.

#### Tier D — reseller / partner (newly reachable)

`/partners` now exists and is indexable, and nothing targets these:

`whatsapp crm reseller india`, `white label whatsapp crm`,
`whatsapp api reseller program`, `whatsapp crm affiliate program`,
`become whatsapp business api partner`.

Low volume, but the intent is an agency bringing multiple customers —
the highest value per visitor on this list.

### 3.2 Nepal

**Do not build these pages before §2 step 2.** Listed so the cluster is
ready when NPR is.

| Cluster | Example terms |
|---|---|
| Direct | `whatsapp crm nepal`, `whatsapp business api nepal`, `crm software nepal` |
| Pricing | `whatsapp api price nepal`, `whatsapp marketing cost nepal` |
| Local commerce | `ecommerce nepal whatsapp`, `daraz seller whatsapp`, `online business nepal messaging` |
| Payments (unsupported today) | `esewa whatsapp integration`, `khalti payment whatsapp` |
| Channel comparison | `viber vs whatsapp business nepal`, `viber business nepal` |

That last row is the interesting one. If Viber genuinely leads in Nepal,
a *fair* comparison page — written honestly, saying when Viber is the
better choice — is the single best Nepal asset we could own, and it
would rank with almost no competition. It is also the page a Nepali
business actually searches for.

**Transliteration note:** Nepali-language search (`ह्वाट्सएप`) is a real
long tail, but shipping Devanagari pages means committing to maintaining
them. Not worth it until English Nepal pages prove the market.

---

## 4. Technical SEO

### Fixed in this cycle
- `/partners` added to `sitemap.ts`; `robots.ts` denylist corrected so
  it is crawlable (see §1).
- `manifest.ts` icons now declare real sizes plus a 512px entry, so
  Chrome treats the app as installable.

### Open

| Item | Why | Effort |
|---|---|---|
| **`hreflang`** | Only needed once there is a Nepal page. Then `en-IN` / `en-NP` / `x-default` on every geo-variant page, reciprocal, via `alternates.languages` in each page's `metadata` | Small, but do it *with* the Nepal page, never before |
| **`areaServed` widening** | `src/lib/seo.ts` hardcodes India. Becomes wrong the moment Nepal ships | Small |
| **Maskable icon** | Manifest has no `purpose: "maskable"` because no asset has the ~20% safe padding Android needs. Declaring it without padding crops the logo | Needs a designer, not code |
| **Blog cover for the cart post** | It reuses its own generated OG card as the hero rather than shipping a placeholder. Fine, but a designed cover would lift the card's click-through | Needs a designer |
| **CSP is report-only** | Tracked in `TODO.md` security section. Not SEO, but a blocked script would break GA4 silently | Test every page first |
| **`AggregateRating` schema** | Only once there are real Trustpilot reviews. **Never invent ratings** — it is a manual action risk, not just dishonest | Blocked on reviews |
| **Core Web Vitals** | Never measured. Run PageSpeed Insights on `/`, `/pricing`, `/blog/<slug>` and record the numbers here | Owner task |

---

## 5. Content backlog

Ordered by intent strength, not by measured volume (§0).

- [ ] **Bulk WhatsApp messages in India without getting banned** — best
      unclaimed Tier A term. Quality rating, messaging limits, opt-in,
      what actually triggers a ban.
- [ ] **COD order confirmation on WhatsApp to cut RTO** — the clearest
      money argument we have for D2C, and the feature is live.
- [ ] **WhatsApp Business API pricing in India (2026)** — **BLOCKED.**
      This post is entirely externally-verifiable numbers. Meta's rate
      card must be opened and checked first (marketing was ~₹0.86 before
      GST as of 2026-01-01, which is already stale as a claim).
      Publishing an out-of-date rate card is worse than having no post:
      it is the one page people will quote back at you. Add a visible
      "last updated" and a quarterly reminder.
- [ ] **How to get the WhatsApp green tick in India** — high intent,
      but Meta changes this process often. Date it and expect to revisit.
- [ ] **DPDP Act and WhatsApp marketing: consent rules** — direct
      follow-on from the cart post, which leans on consent without
      explaining it.
- [ ] **20 WhatsApp marketing templates that get approved** — India
      examples, grouped by category.
- [ ] **WhatsApp chatbot without code** — the AI chatbot is live.
- [ ] **Click-to-WhatsApp ads → leads in a CRM.**
- [ ] **WhatsApp Business app vs API** — expand the existing comparison
      page into a full guide with a decision table.
- [ ] **Vertical posts** — real estate site visits, coaching institute
      admissions, restaurants.
- [ ] **Nepal: Viber vs WhatsApp Business** — see §3.2. After NPR.

### Bigger pieces
- [ ] **`/whatsapp-api-pricing-calculator`** — interactive, earns links,
      and answers the highest-intent question on the site. Depends on
      the same verified rate card as the pricing post.
- [ ] **"Best WhatsApp Business API providers in India"** roundup — fair,
      includes us, includes competitors honestly. These rank and get
      linked precisely because they are not self-serving.
- [ ] **`/whatsapp-crm-nepal`** — after §2 step 2.
- [ ] Refresh `src/lib/compare.ts` competitor prices quarterly (update
      `PRICES_CHECKED`).
- [ ] Founder name and photo, real customer quotes, real usage numbers
      on `/about` and `/`. **Never invented.**

---

## 6. Impressions are not leads

The ask was impressions *and* leads. They are different problems, and
the second one is where this site currently leaks.

Every ranking page should have one obvious next step, and right now the
blog posts mostly end in prose. Worth fixing:

- **`/demo` is the conversion page.** Blog posts should link to it in
  the body, not only in a footer CTA. The cart post links to
  `/integrations/shopify` and `/docs/api` — useful, but neither captures
  a lead.
- **Mark `generate_lead` as a key event in GA4.** Until that is done
  there is no way to tell which page produced a lead, which means no way
  to decide what to write next. This is the single highest-value item in
  this document and it takes ten minutes.
- **Test the demo form end to end** — row in `demo_requests`, email to
  sales@, visible in `/admin`. A silently broken form turns every
  ranking into nothing.
- **`/pricing` must answer "what will this cost me"** without a call.
  Vague pricing is the most common reason high-intent traffic bounces.
- **The partner page is a lead source too.** One approved agency is
  worth more than many self-serve signups, and `/partners` is now
  indexable.

---

## 7. Owner tasks (not code)

- [ ] **Keyword Planner volumes** for §3, India and Nepal separately.
      Blocks the whole priority order.
- [ ] **Verify Nepal messenger share** (§2). Blocks the Nepal plan.
- [ ] **GA4: mark `generate_lead` as a key event**; confirm Realtime works.
- [ ] **Search Console**: resubmit the sitemap, request indexing for
      `/partners` and the newest posts, then read Queries after 4–6 weeks.
      Queries is the only free source of real demand data you have.
- [ ] **Test the demo form end to end.**
- [ ] **PageSpeed Insights** on `/`, `/pricing`, one blog post; record here.
- [ ] 5–10 Trustpilot reviews from real customers (unblocks
      `AggregateRating`).
- [ ] LinkedIn page completed, weekly posts sharing each article.
- [ ] Directory listings with backlinks: G2, Capterra, SaaSworthy,
      Product Hunt, Indian startup directories.
- [ ] Designer: maskable app icon with safe padding; cover image for the
      cart post.
