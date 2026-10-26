import Link from "next/link";
import {
  PLAY_LOGO_SVG,
  PLAY_STORE_URL,
  RESTROGROW_LABEL,
  RESTROGROW_TITLE,
  RESTROGROW_URL,
} from "@/lib/landing-chrome";

// Compact footer of the marketing site's main pages, for the pages that
// don't use the landing-page chrome (blog, comparison and industry pages).
// Every public page links to every other section, which helps Google find
// and index them and pick the right sitelinks for "repeat grow" searches.
// Entries marked `external` (off-site) render as a plain <a> in a new tab.
// Keep in step with LANDING_FOOTER_HTML in src/lib/landing-chrome.ts.
type SiteLink = { href: string; label: string; title?: string; external?: true };

const GROUPS: { heading: string; links: SiteLink[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/", label: "Repeat Grow home" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Book a demo" },
      { href: "/docs", label: "Help Center" },
      { href: PLAY_STORE_URL, label: "Android app", external: true },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { href: "/whatsapp-crm-for-ecommerce", label: "E-commerce & D2C" },
      { href: "/whatsapp-crm-for-real-estate", label: "Real estate" },
      { href: "/whatsapp-crm-for-education", label: "Coaching & education" },
      { href: "/whatsapp-crm-vs-whatsapp-business-app", label: "CRM vs WhatsApp Business app" },
      { href: "/official-vs-unofficial-whatsapp-api", label: "Official vs unofficial API" },
    ],
  },
  {
    heading: "Compare",
    links: [
      { href: "/wati-alternative", label: "WATI alternative" },
      { href: "/interakt-alternative", label: "Interakt alternative" },
      { href: "/aisensy-alternative", label: "AiSensy alternative" },
      { href: "/wati-vs-interakt-vs-aisensy", label: "WATI vs Interakt vs AiSensy" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact us" },
      { href: "/security", label: "Security" },
      { href: RESTROGROW_URL, label: RESTROGROW_LABEL, title: RESTROGROW_TITLE, external: true },
    ],
  },
];

function FooterLink({ link }: { link: SiteLink }) {
  const Tag = link.external ? "a" : Link;
  return (
    <Tag
      href={link.href}
      title={link.title}
      className="text-muted-foreground hover:text-foreground"
      {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
    >
      {link.label}
    </Tag>
  );
}

export function SiteLinks() {
  return (
    <nav aria-label="Repeat Grow site" className="mt-16 border-t border-border pt-10">
      <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-4">
        {GROUPS.map((group) => (
          <div key={group.heading}>
            <p className="font-semibold">{group.heading}</p>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <FooterLink link={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          &copy; 2026 Repeat Grow. WhatsApp CRM on the official WhatsApp Business API.
        </p>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener"
          aria-label="Get Repeat Grow on Google Play"
          className="inline-flex items-center gap-2.5 rounded-lg border border-white/30 bg-black py-1.5 pr-4 pl-3 text-white transition hover:-translate-y-px"
        >
          <span dangerouslySetInnerHTML={{ __html: PLAY_LOGO_SVG }} className="flex" />
          <span className="text-base leading-tight font-semibold">
            <small className="block text-[10px] font-medium tracking-wider uppercase">
              Get it on
            </small>
            Google Play
          </span>
        </a>
      </div>
    </nav>
  );
}
