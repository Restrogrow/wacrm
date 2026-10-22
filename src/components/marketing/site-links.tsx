import Link from "next/link";

// Compact footer of the marketing site's main pages, for the pages that
// don't use the landing-page chrome (blog, comparison and industry pages).
// Every public page links to every other section, which helps Google find
// and index them and pick the right sitelinks for "repeat grow" searches.
// Keep in step with LANDING_FOOTER_HTML in src/lib/landing-chrome.ts.
const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/", label: "Repeat Grow home" },
      { href: "/pricing", label: "Pricing" },
      { href: "/demo", label: "Book a demo" },
      { href: "/docs", label: "Help Center" },
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
    ],
  },
];

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
                  <Link href={link.href} className="text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">
        &copy; 2026 Repeat Grow. WhatsApp CRM on the official WhatsApp Business API.
      </p>
    </nav>
  );
}
