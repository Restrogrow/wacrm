// Content for the competitor comparison pages (/wati-alternative and friends).
//
// Competitor facts come from each provider's public pricing page, checked on
// PRICES_CHECKED. Prices and plans change, so every page says when it was
// checked and links readers to the provider's own site. Do not add a claim
// here that you have not verified against the provider's current page.

export const PRICES_CHECKED = "16 October 2026";

export interface CompareFaq {
  question: string;
  answer: string;
}

export interface ComparePageData {
  slug: string;
  /** Short name used in the breadcrumb and cross-links. */
  navName: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  quickAnswer: string;
  table: { headers: string[]; rows: string[][] };
  chooseThem: { heading: string; items: string[] };
  chooseUs: { heading: string; items: string[] };
  facts: { heading: string; items: string[] }[];
  faqs: CompareFaq[];
}

const RG_PRICE =
  "Starter ₹999, Growth ₹1,999, Pro ₹3,999 per month, Enterprise custom (save about 10% quarterly, 17% yearly)";
const RG_LIMITS =
  "Plans differ by limits: contacts (2,000 / 50,000 / 2,00,000 / unlimited), broadcasts per month (60 / 250 / 1,000 / unlimited), automations and flows (5 / 25 / 100 / unlimited), team members (5 / 25 / 50 / unlimited)";

export const COMPARE_PAGES: ComparePageData[] = [
  {
    slug: "wati-alternative",
    navName: "WATI alternative",
    title: "WATI Alternative in India: Repeat Grow vs WATI (2026)",
    h1: "WATI alternative for Indian businesses",
    description:
      "Repeat Grow vs WATI: rupee prices, AI, chatbots, integrations and who each suits. From WATI's public pricing page, October 2026.",
    intro:
      "WATI is a well-known WhatsApp platform with an omnichannel inbox and AI agents. If you are weighing it against Repeat Grow, here is a plain comparison of price, features and who each one suits.",
    quickAnswer:
      "Repeat Grow costs less and keeps every feature on every plan, with the limits changing by plan. WATI is the better fit if you need Instagram, Facebook, TikTok and other channels in one inbox, voice AI agents, or several WhatsApp numbers on one account.",
    table: {
      headers: ["", "Repeat Grow", "WATI"],
      rows: [
        ["Plans and price", RG_PRICE, "Growth ₹2,699, Pro ₹5,799, Business ₹16,799 per month, billed quarterly"],
        ["Team members", "5 / 25 / 50 / unlimited by plan", "3 users on Growth, 5 on Pro and Business; extra users ₹1,299 (Pro) or ₹2,199 (Business) each per month"],
        ["Channels", "WhatsApp", "WhatsApp, calling, Facebook, Instagram, TikTok, web chat, RCS and more"],
        ["AI", "AI chatbot and AI flow builder on every plan", "AI in the inbox and Astra AI agents, limited by AI credits (2,000 / 5,000 / 20,000 per month by plan)"],
        ["Broadcasts", "60 / 250 / unlimited per month by plan, scheduled sending, carousel templates", "Up to 15K per month on Growth, unlimited on Pro and Business"],
        ["Integrations", "Shopify, Calendly, public REST API and webhooks on every plan", "2 integrations on Growth, 5 on Pro (including HubSpot), unlimited on Business (including Salesforce)"],
        ["API and webhooks", "Public REST API and signed webhooks on every plan", "10k API calls and no webhooks on Growth; limited webhooks on Pro; extensive on Business"],
        ["Payments in chat", "WhatsApp Pay and UPI orders, catalog sharing", "Catalog and order templates; Shopify tools"],
        ["Setup", "Done for you, included on every plan", "Zero-fee WhatsApp setup"],
        ["Message fees", "WhatsApp conversation fees are billed by Meta", "Extra charges for template and service messages; see WATI's rate card"],
      ],
    },
    chooseThem: {
      heading: "Choose WATI if",
      items: [
        "You want Instagram, Facebook, TikTok, web chat or RCS in the same inbox as WhatsApp.",
        "You need voice AI agents, multiple WhatsApp numbers or multiple ad accounts on one account.",
        "You rely on HubSpot or Salesforce and want those integrations built in.",
        "You need enterprise controls such as number masking, chat privacy and IP whitelisting.",
      ],
    },
    chooseUs: {
      heading: "Choose Repeat Grow if",
      items: [
        "You sell and support mainly on WhatsApp and want a lower monthly price in rupees.",
        "You want every feature on every plan, including the AI chatbot, automations, flows and the API.",
        "You want WhatsApp Pay and UPI orders, Shopify order messages and Calendly reminders ready to switch on.",
        "You want us to set up the WhatsApp Business API number and import your contacts.",
      ],
    },
    facts: [
      {
        heading: "WATI plans (from its public pricing page)",
        items: [
          "Growth ₹2,699 per month billed quarterly: 3 users, up to 15K broadcasts, 1 Astra AI agent, 2,000 AI credits, 1,000 free automation triggers, 2 integrations, 10k API calls.",
          "Pro ₹5,799 per month billed quarterly: 5 users, unlimited broadcasts, forms and third-party webhooks, 2 Astra AI agents, 5,000 AI credits, 5 integrations including HubSpot.",
          "Business ₹16,799 per month billed quarterly: 5 users, multiple numbers, unlimited Astra AI agents including voice AI, 20,000 AI credits, unlimited integrations including Salesforce.",
        ],
      },
      {
        heading: "Repeat Grow plans",
        items: [RG_PRICE + ".", RG_LIMITS + "."],
      },
    ],
    faqs: [
      {
        question: "Is Repeat Grow cheaper than WATI?",
        answer:
          "On published list prices, yes. Repeat Grow starts at ₹999 per month, while WATI's cheapest plan is ₹2,699 per month billed quarterly. The two differ in features, so compare what you actually need.",
      },
      {
        question: "Does Repeat Grow support Instagram or Facebook inboxes like WATI?",
        answer:
          "No. Repeat Grow focuses on WhatsApp. If you need other social channels in the same inbox, WATI is the better fit.",
      },
      {
        question: "Can I move my WhatsApp number from WATI to Repeat Grow?",
        answer:
          "Usually yes. A number on the official WhatsApp Business API can be moved between providers. We handle the migration steps and import your contacts during setup. Book a demo and we will confirm for your number.",
      },
    ],
  },
  {
    slug: "interakt-alternative",
    navName: "Interakt alternative",
    title: "Interakt Alternative in India: Repeat Grow vs Interakt",
    h1: "Interakt alternative for Indian businesses",
    description:
      "Repeat Grow vs Interakt: rupee prices, chatbot flows, payments, API access and who each suits. From Interakt's pricing page, October 2026.",
    intro:
      "Interakt is a well-known WhatsApp platform used by many Indian businesses. Here is how it compares with Repeat Grow on price, features and fit.",
    quickAnswer:
      "Repeat Grow is cheaper per month and includes the API, AI chatbot and flows on every plan. Interakt's higher plans add branching chatbot flows, native payments and auto-assignment, and it offers unlimited agents and an RCS channel on its top plan.",
    table: {
      headers: ["", "Repeat Grow", "Interakt"],
      rows: [
        ["Plans and price", RG_PRICE, "Starter ₹3,499, Growth ₹7,699, Advanced ₹10,499 per quarter plus taxes (about ₹1,166, ₹2,566 and ₹3,500 per month); Enterprise on request"],
        ["Team members", "5 / 25 / 50 / unlimited by plan", "Unlimited agents on every plan (owner roles only on Starter)"],
        ["Chatbots", "AI chatbot, visual flows with branches and waits on every plan", "FAQ automations and linear flows on Growth; branching flows with API calls and conditions on Advanced"],
        ["Broadcasts", "60 / 250 / unlimited per month by plan, scheduled sending, carousel templates", "Bulk campaigns on every plan; advanced campaigns from Growth"],
        ["Payments and catalog", "WhatsApp Pay and UPI orders, catalog sharing, catalog carts to orders", "Catalogs and native payments from Growth"],
        ["API and webhooks", "Public REST API and signed webhooks on every plan", "Public APIs from Growth; advanced webhooks on Advanced"],
        ["Limits", RG_LIMITS, "Unlimited contacts; custom fields 15 / 25 / 30 and tags 15 / 30 / 45 by plan"],
        ["Channels", "WhatsApp", "One channel on Starter, both channels on Growth and above; RCS on Enterprise"],
        ["Setup", "Done for you, included on every plan", "Free trial available"],
        ["Message fees", "WhatsApp conversation fees are billed by Meta", "Marketing about ₹0.95 to ₹0.97, utility ₹0.14 to ₹0.16 per message by plan, as listed by Interakt"],
      ],
    },
    chooseThem: {
      heading: "Choose Interakt if",
      items: [
        "You want unlimited agents on every plan.",
        "You need RCS or higher sending speeds on an enterprise contract.",
        "You want to start with a free trial and pay quarterly.",
        "You need Interakt's native payments flow and are comfortable paying for the Growth tier or above.",
      ],
    },
    chooseUs: {
      heading: "Choose Repeat Grow if",
      items: [
        "You want a lower monthly price, starting at ₹999, without losing the API or automations.",
        "You want an AI chatbot and branching flows on every plan, not only the highest tier.",
        "You want WhatsApp Pay or UPI orders, Shopify and Calendly messages ready to switch on.",
        "You want done-for-you WhatsApp Business API setup and a demo with someone who knows your use case.",
      ],
    },
    facts: [
      {
        heading: "Interakt plans (from its public pricing page)",
        items: [
          "Starter ₹3,499 per quarter plus taxes: unlimited agents (owner roles), one channel, bulk campaigns, shared inbox and simple greeting or out-of-office automations. 15 custom fields and 15 tags.",
          "Growth ₹7,699 per quarter plus taxes: adds FAQ automations and linear chatbot flows, advanced campaigns, catalogs, native payments and public APIs. 25 custom fields, 30 tags, 5 custom events.",
          "Advanced ₹10,499 per quarter plus taxes: adds advanced chatbot flows with branching, API calls and conditions, chat auto-assignment and advanced webhooks. 30 custom fields, 45 tags, 7 custom events.",
          "Enterprise on request: RCS channel, higher rate limits, better campaign speeds, no template markups and personalised support.",
        ],
      },
      {
        heading: "Repeat Grow plans",
        items: [RG_PRICE + ".", RG_LIMITS + "."],
      },
    ],
    faqs: [
      {
        question: "Is Repeat Grow cheaper than Interakt?",
        answer:
          "On published list prices, yes. Interakt's Starter is ₹3,499 per quarter (about ₹1,166 per month) plus taxes; Repeat Grow Starter is ₹999 per month, or ₹2,699 per quarter. Interakt's higher tiers add features that Repeat Grow already includes on every plan, such as the API and branching flows.",
      },
      {
        question: "Does Repeat Grow limit the number of agents?",
        answer:
          "Yes. Starter includes 5 team members, Growth 25, Pro 50 and Enterprise is unlimited. Interakt lists unlimited agents on every plan, which may suit you better if you have a very large support team on a low plan.",
      },
      {
        question: "Can I switch from Interakt without losing my number?",
        answer:
          "In most cases yes, because the number stays on the official WhatsApp Business API. We handle the move and contact import during setup. Book a demo and we will confirm for your number.",
      },
    ],
  },
  {
    slug: "aisensy-alternative",
    navName: "AiSensy alternative",
    title: "AiSensy Alternative in India: Repeat Grow vs AiSensy",
    h1: "AiSensy alternative for Indian businesses",
    description:
      "Repeat Grow vs AiSensy: rupee prices, AI agent and chatbot add-ons, broadcasts and who each suits. From AiSensy's pricing page, October 2026.",
    intro:
      "AiSensy is a popular choice for WhatsApp marketing in India, with a free plan and a Click-to-WhatsApp ads manager. Here is how it compares with Repeat Grow.",
    quickAnswer:
      "Repeat Grow includes the AI chatbot and chatbot flows in every plan, while AiSensy sells its AI Chat Agent and Chatbot Flows as paid add-ons. AiSensy is the better fit if you want a free starter plan, a Meta ads manager or very high sending speeds.",
    table: {
      headers: ["", "Repeat Grow", "AiSensy"],
      rows: [
        ["Plans and price", RG_PRICE, "Free plan; Basic ₹1,425, Pro ₹3,040, Premium ₹8,645, Unlimited ₹42,750 per month, billed quarterly"],
        ["AI chatbot", "Included on every plan", "AI Chat Agent is an add-on at ₹1,350 per month for 1,000 AI messages"],
        ["Chatbot flows", "Included on every plan", "Add-on at ₹2,500 per month for 5 chatbots"],
        ["Team members", "5 / 25 / 50 / unlimited by plan", "Basic includes 1 owner and 5 agents; extra seats ₹750 per month each"],
        ["Broadcasts", "60 / 250 / unlimited per month by plan; scheduled sending on every plan", "Broadcasting from Basic; scheduler, click tracking and budget analytics on Pro"],
        ["Integrations", "Shopify, Calendly, public REST API and webhooks on every plan", "Shopify and WooCommerce from Basic; webhooks from Premium"],
        ["Payments in chat", "WhatsApp Pay and UPI orders, catalog sharing", "Catalog sharing and cart management in the chatbot add-on"],
        ["Ads", "Not included", "Click-to-WhatsApp Ads Manager and Meta ad credits"],
        ["Setup", "Done for you, included on every plan", "Free WhatsApp Business API setup and Blue Tick application"],
        ["Message fees", "WhatsApp conversation fees are billed by Meta", "Marketing ₹1.09, utility and authentication ₹0.145 per message for India, as listed by AiSensy"],
      ],
    },
    chooseThem: {
      heading: "Choose AiSensy if",
      items: [
        "You want a free forever plan to claim the WhatsApp Business API and test before paying.",
        "You want to create and manage Click-to-WhatsApp and other Meta ads from the same tool.",
        "You send very large campaigns and need sending speeds up to 250 or 1,000 messages a second.",
        "You need reports, number masking, SSO or an enterprise contract on a higher plan.",
      ],
    },
    chooseUs: {
      heading: "Choose Repeat Grow if",
      items: [
        "You want the AI chatbot and chatbot flows included instead of paying for add-ons.",
        "You want one simple price starting at ₹999 a month.",
        "You want WhatsApp Pay or UPI orders, Shopify and Calendly messages and browser voice calls.",
        "You want us to set up your WhatsApp Business API number and walk your team through it.",
      ],
    },
    facts: [
      {
        heading: "AiSensy pricing (from its public pricing page)",
        items: [
          "Free Forever: free WhatsApp Business API access, Blue Tick application, shared live chat inbox, unlimited contacts. Broadcasting is not included.",
          "Basic ₹1,425 per month (₹4,275 billed quarterly): broadcasting and retargeting, shared team inbox, 1 owner and 5 agents, up to 10 tags and 5 custom attributes.",
          "Pro ₹3,040 per month: adds campaign scheduler, click tracking, smart agent routing, project APIs and user access control.",
          "Premium ₹8,645 per month and Unlimited ₹42,750 per month: higher speed, more agents, number masking, reports and webhooks. Enterprise is custom.",
          "Add-ons on any plan: AI Chat Agent ₹1,350 per month for 1,000 AI messages, Chatbot Flows ₹2,500 per month, extra agent seats ₹750 per month each.",
        ],
      },
      {
        heading: "A rough example at list prices",
        items: [
          "AiSensy Basic with the AI Chat Agent and Chatbot Flows add-ons: ₹1,425 + ₹1,350 + ₹2,500 = ₹5,275 per month, before WhatsApp message fees.",
          "Repeat Grow Starter, with the AI chatbot and flows included: ₹999 per month (Growth ₹1,999), before WhatsApp message fees.",
          "Feature depth and AI message allowances differ, so compare on your own volume. Book a demo and we will walk through your numbers.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is Repeat Grow cheaper than AiSensy?",
        answer:
          "If you need the AI agent and chatbot flows, usually yes, because AiSensy sells them as add-ons (₹1,350 and ₹2,500 per month) on top of the plan. If you only need broadcasting, AiSensy's Basic plan at ₹1,425 per month and its free plan are also worth comparing.",
      },
      {
        question: "Does Repeat Grow have a free plan?",
        answer:
          "No. Every new account gets a 7-day free trial with Growth limits, and paid plans start at ₹999 per month.",
      },
      {
        question: "Can I move from AiSensy to Repeat Grow?",
        answer:
          "Usually yes, because the number stays on the official WhatsApp Business API. We handle the move and import your contacts. Book a demo and we will confirm for your number.",
      },
    ],
  },
  {
    slug: "wati-vs-interakt-vs-aisensy",
    navName: "WATI vs Interakt vs AiSensy",
    title: "WATI vs Interakt vs AiSensy: Pricing Compared (2026)",
    h1: "WATI vs Interakt vs AiSensy vs Repeat Grow",
    description:
      "WATI, Interakt, AiSensy and Repeat Grow compared for India: starting prices in rupees, AI, chatbots, team size and integrations. October 2026.",
    intro:
      "Choosing a WhatsApp Business API platform in India usually comes down to three popular tools and a few newer ones. This page compares WATI, Interakt, AiSensy and Repeat Grow using each provider's public pricing page.",
    quickAnswer:
      "For a low price with every feature on every plan, Repeat Grow starts at ₹999 per month. WATI suits teams that need many channels and enterprise AI. Interakt suits teams that want unlimited agents. AiSensy suits teams that want a free plan, ads tools or very high sending speeds.",
    table: {
      headers: ["", "Repeat Grow", "WATI", "Interakt", "AiSensy"],
      rows: [
        ["Entry price", "Starter ₹999 per month", "₹2,699 per month, billed quarterly", "₹3,499 per quarter (about ₹1,166 per month) plus taxes", "Free plan; Basic ₹1,425 per month"],
        ["Mid plan", "Growth ₹1,999 per month", "Pro ₹5,799 per month", "Growth ₹7,699 per quarter (about ₹2,566 per month)", "Pro ₹3,040 per month"],
        ["Top public plan", "Pro ₹3,999 per month", "Business ₹16,799 per month", "Advanced ₹10,499 per quarter (about ₹3,500 per month)", "Unlimited ₹42,750 per month"],
        ["Team size", "5 / 25 / 50 / unlimited", "3 to 5 users included; extra users charged", "Unlimited agents", "5 agents on Basic; extra seats ₹750"],
        ["AI", "AI chatbot and flow builder on every plan", "AI and Astra agents, limited by AI credits", "Chatbot flows by plan", "AI Chat Agent add-on, ₹1,350 per month"],
        ["Chatbot flows", "Every plan", "Chatbots from Growth", "Linear on Growth, branching on Advanced", "Add-on, ₹2,500 per month"],
        ["Other channels", "WhatsApp only", "Instagram, Facebook, TikTok, web chat, RCS", "Second channel on Growth and up; RCS on Enterprise", "WhatsApp, plus a Meta ads manager"],
        ["API and webhooks", "Every plan", "API calls limited by plan; webhooks from Pro", "API from Growth; webhooks on Advanced", "Template API from Basic, project APIs from Pro; webhooks from Premium"],
        ["Setup", "Done for you", "Zero-fee setup", "Self-serve", "Free API setup and Blue Tick application"],
      ],
    },
    chooseThem: {
      heading: "Which one to pick",
      items: [
        "Pick WATI for many social channels in one inbox, voice AI agents, multiple numbers or Salesforce and HubSpot.",
        "Pick Interakt for unlimited agents and a simple, long-established product with a free trial.",
        "Pick AiSensy for a free starter plan, a Meta ads manager or very large, fast campaigns.",
      ],
    },
    chooseUs: {
      heading: "Pick Repeat Grow if",
      items: [
        "You mostly work on WhatsApp and want the lowest monthly price in rupees.",
        "You want the AI chatbot, flows, API and webhooks on every plan, with only the limits changing.",
        "You want WhatsApp Pay and UPI orders, Shopify and Calendly messages and browser voice calls.",
        "You want setup done for you and a team that answers on WhatsApp.",
      ],
    },
    facts: [
      {
        heading: "Notes on how to compare",
        items: [
          "All four use the official WhatsApp Business API, so Meta's per-message fees apply on top of the plan price. Each provider lists its own rate card.",
          "Interakt prices are per quarter plus taxes; monthly figures here are the quarterly price divided by three.",
          "Plans change often. Check each provider's pricing page before you decide.",
        ],
      },
    ],
    faqs: [
      {
        question: "Which is the cheapest WhatsApp Business API platform in India?",
        answer:
          "On published list prices, Repeat Grow starts at ₹999 per month, AiSensy has a free plan (without broadcasting) and a Basic plan at ₹1,425 per month, Interakt Starter is about ₹1,166 per month, and WATI Growth is ₹2,699 per month. The right choice depends on the features and limits you need.",
      },
      {
        question: "Do I still pay WhatsApp message fees?",
        answer:
          "Yes. On every provider, Meta charges per-message fees for marketing, utility and authentication templates, and for service messages after the free monthly allowance. These are in addition to the platform price.",
      },
      {
        question: "Can I try Repeat Grow before deciding?",
        answer:
          "Yes. Every new account gets a 7-day free trial, or you can book a demo and we will show it on your own use case.",
      },
    ],
  },
];

export function getComparePage(slug: string): ComparePageData {
  const page = COMPARE_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown compare page: ${slug}`);
  return page;
}
