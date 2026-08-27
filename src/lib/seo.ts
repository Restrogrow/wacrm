export const SITE_URL = "https://repeatgrow.com";

export const BRAND_NAME = "Repeat Grow";

export const DEFAULT_TITLE = "Repeat Grow — WhatsApp CRM for sales & support teams";

export const DEFAULT_DESCRIPTION =
  "WhatsApp CRM for sales and support teams — shared inbox, contacts, pipelines, broadcasts, and automations.";

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

export const SUPPORT_EMAIL = "support.repeatgrow@gmail.com";
export const SUPPORT_PHONE = "+916377568749";

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
