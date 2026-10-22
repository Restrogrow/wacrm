export const SITE_URL = "https://repeatgrow.com";

export const BRAND_NAME = "Repeat Grow";

export const DEFAULT_TITLE = "Repeat Grow: WhatsApp CRM for sales & support teams";

export const DEFAULT_DESCRIPTION =
  "WhatsApp CRM for sales and support teams: shared inbox, contacts, pipelines, broadcasts, and automations.";

export const BRAND_KEYWORDS = [
  "Repeat Grow",
  "RepeatGrow",
  "WhatsApp CRM",
  "WhatsApp Business API CRM",
  "WhatsApp shared inbox",
  "WhatsApp sales pipeline",
  "WhatsApp broadcast software",
  "WhatsApp automation tool",
  "CRM for WhatsApp Business",
  "official WhatsApp Business API software",
];

export const SUPPORT_EMAIL = "support@repeatgrow.com";
export const SUPPORT_PHONE = "+916377568749";

/** Official profiles, used for the Organization `sameAs` and site links. */
export const LINKEDIN_URL = "https://www.linkedin.com/company/repeat-grow";
export const TRUSTPILOT_URL = "https://www.trustpilot.com/review/repeatgrow.com";
export const SOCIAL_PROFILES = [LINKEDIN_URL, TRUSTPILOT_URL];

/** Organization node, standalone-valid (carries "@context") for use as its own JSON-LD block. */
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  ...buildOrganizationNode(),
};

/** Same Organization data without "@context" — for nesting inside an "@graph". */
export function buildOrganizationNode() {
  return {
    "@type": "Organization",
    "@id": SITE_URL,
    name: BRAND_NAME,
    alternateName: "RepeatGrow",
    url: SITE_URL,
    logo: `${SITE_URL}/logo-v2.png`,
    description:
      "WhatsApp CRM and official WhatsApp Business API platform for Indian businesses: shared inbox, AI chatbot, broadcasts, payments, Shopify and Calendly.",
    areaServed: { "@type": "Country", name: "India" },
    sameAs: SOCIAL_PROFILES,
    email: SUPPORT_EMAIL,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SUPPORT_EMAIL,
        telephone: SUPPORT_PHONE,
        areaServed: "IN",
        availableLanguage: ["English"],
      },
    ],
  };
}

/**
 * WebSite node without "@context" — on the homepage, so Google shows "Repeat Grow"
 * as the site name and ties searches like "repeatgrow" / "repeat grow" to this site.
 */
export function buildWebSiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND_NAME,
    alternateName: ["RepeatGrow", "Repeat Grow CRM", "repeatgrow.com"],
    url: `${SITE_URL}/`,
    inLanguage: "en-IN",
    publisher: { "@id": SITE_URL },
  };
}

/** BreadcrumbList node without "@context" — for nesting inside an "@graph". `items` excludes the implicit Home root. */
export function buildBreadcrumbNode(items: Array<{ name: string; path: string }>) {
  const trail = [{ name: "Home", path: "/" }, ...items];
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** Standalone-valid BreadcrumbList JSON-LD (carries "@context") for use as its own script tag. */
export function buildBreadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    ...buildBreadcrumbNode(items),
  };
}

/** Standalone-valid BlogPosting JSON-LD (carries "@context") for a blog article. */
export function buildArticleSchema(article: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  /** Absolute or site-relative image URL (e.g. the post's OG image). */
  image?: string;
  keywords?: string[];
  section?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    url: `${SITE_URL}${article.path}`,
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    author: { "@id": SITE_URL },
    publisher: { "@id": SITE_URL },
    mainEntityOfPage: `${SITE_URL}${article.path}`,
    ...(article.image
      ? { image: article.image.startsWith("http") ? article.image : `${SITE_URL}${article.image}` }
      : {}),
    ...(article.keywords?.length ? { keywords: article.keywords.join(", ") } : {}),
    ...(article.section ? { articleSection: article.section } : {}),
  };
}

/** FAQPage node without "@context" — for nesting inside an "@graph". */
export function buildFAQNode(items: Array<{ question: string; answer: string }>) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
