/**
 * In-app help assistant — the floating chat bubble in the dashboard.
 *
 * It answers "how do I…" questions about Repeat Grow itself and points
 * people at the right page. It does NOT read or change account data; it
 * only knows the product map below. Shares the Gemini client with the
 * customer-facing AI chatbot.
 */

import { AI_NOT_CONFIGURED, aiApiKey, aiChat, aiModel, type ChatMessage } from "./gemini";

export interface AssistantPage {
  href: string;
  label: string;
  about: string;
}

/** Every page the assistant may link to. Links outside this list are dropped. */
export const ASSISTANT_PAGES: AssistantPage[] = [
  { href: "/dashboard", label: "Dashboard", about: "Live numbers: active chats, new contacts, open deals value, messages sent, charts and recent activity." },
  { href: "/inbox", label: "Inbox", about: "Shared WhatsApp inbox. Reply, assign chats, change status, add tags, send templates, saved replies (type /), orders and payment requests (₹ icon), products from your catalog (bag icon), short links, WhatsApp forms, AI summary, AI suggested replies (sparkle button), voice call, and share a chat. Internal notes: switch the composer from Reply to Internal note (teammates only, never sent to the customer; @mention a teammate to notify them). \"Send later\" schedules a message. Select mode lets you assign, close, tag or mark many chats at once. A chat shows an SLA badge when the customer has waited too long." },
  { href: "/notifications", label: "Notifications", about: "Alerts when a teammate assigns a conversation to you or @mentions you, when a reply is overdue (SLA), and when stock is low." },
  { href: "/reports", label: "Reports", about: "Message volume and delivery, response and resolution times, agent performance, broadcast results, deals and orders, and customer satisfaction (CSAT), with a date range and CSV export." },
  { href: "/calls", label: "Calls", about: "History of WhatsApp calls with optional AI call notes." },
  { href: "/daily-summary", label: "Daily summary", about: "A daily email with how WhatsApp went; choose the time and recipients." },
  { href: "/contacts", label: "Contacts", about: "Contact list: add, import (CSV), export, tags, custom fields, filters. Saved segments (smart lists, also usable as a broadcast audience), a duplicate finder and merge for two contacts." },
  { href: "/pipelines", label: "Pipelines", about: "Kanban sales pipelines with stages and deals; drag deals between stages." },
  { href: "/orders", label: "Orders & payments", about: "Set WhatsApp Pay or UPI, add a catalog ID, and track order payment and delivery." },
  { href: "/catalog", label: "Catalog", about: "Your product library: add products, import or export CSV, sync products to your WhatsApp catalog or fetch the ones already there, sync from Shopify or WooCommerce, and make collections to send in chats. Needs the catalog ID in Orders & payments." },
  { href: "/broadcasts", label: "Broadcasts", about: "Send a template to many contacts, now or scheduled; see delivery and read stats." },
  { href: "/templates", label: "Templates", about: "Create WhatsApp message templates, submit to Meta for approval, sync from Meta, create with AI." },
  { href: "/automations", label: "Automations", about: "No-code workflows triggered by WhatsApp events (welcome message, keyword, tag added...)." },
  { href: "/journeys", label: "Journeys", about: "Automatic lifecycle messages: birthday or renewal messages from a date, drip sequences, and win-back messages to inactive contacts. Uses approved templates, quiet hours and a daily limit per contact." },
  { href: "/flows", label: "Flows", about: "Beta: branching, button-driven conversation builder (menus, FAQs, triage)." },
  { href: "/ai-chatbot", label: "AI chatbot", about: "AI that replies to customers from your knowledge base; test it, then switch it on." },
  { href: "/forms", label: "WhatsApp forms", about: "Forms that open inside WhatsApp to collect leads, bookings or feedback." },
  { href: "/qr-link", label: "QR & WhatsApp link", about: "Make a wa.me link and printable QR code with a ready-typed first message." },
  { href: "/integrations/shopify", label: "Shopify", about: "Connect a store to send order, shipping, delivery and abandoned-cart WhatsApp messages." },
  { href: "/integrations/woocommerce", label: "WooCommerce", about: "Connect a WooCommerce store with a webhook to send order, completed, cancelled and refund WhatsApp messages." },
  { href: "/integrations/calcom", label: "Cal.com", about: "Booking confirmations, 24h/1h reminders and cancellation messages from Cal.com bookings, via a webhook." },
  { href: "/integrations/shiprocket", label: "Shiprocket", about: "WhatsApp shipment updates (shipped, out for delivery, delivered, delivery failed, return) from Shiprocket tracking webhooks." },
  { href: "/integrations/calendly", label: "Calendly", about: "Booking confirmations, 24h/1h reminders, cancellation and no-show messages (needs a paid Calendly plan)." },
  { href: "/integrations/hooks", label: "Webhooks & alerts", about: "Inbound webhook URLs so Zapier, Make, n8n or forms can create contacts and send a template, and Slack, Discord or Telegram alerts for new chats, overdue replies, ad leads, payments and orders." },
  { href: "/integrations/apps", label: "Connected apps", about: "Apps that were connected to your account; disconnect them here." },
  { href: "/settings?tab=whatsapp", label: "WhatsApp connection", about: "Connect or reconnect your WhatsApp Business number; number health and calling." },
  { href: "/settings?tab=members", label: "Team members", about: "Invite teammates and set roles (owner, admin, agent, viewer)." },
  { href: "/settings?tab=billing", label: "Plan & billing", about: "Your plan, usage against limits, and how to upgrade. Meta conversation fees are billed separately by Meta." },
  { href: "/settings?tab=api", label: "API keys", about: "Keys for the public REST API (/api/v1)." },
  { href: "/settings?tab=fields", label: "Fields & tags", about: "Colour-coded tags and custom contact fields." },
  { href: "/settings?tab=saved-replies", label: "Saved replies", about: "Reusable answers; type / in the inbox to use them." },
  { href: "/settings?tab=business-hours", label: "Business hours", about: "Weekly opening hours, holidays, welcome and away auto-replies, and the first-response time target for SLA alerts." },
  { href: "/settings?tab=website-widget", label: "Website chat widget", about: "A floating WhatsApp button for your website: customise it, copy one script tag, and see impressions and clicks." },
  { href: "/settings?tab=short-links", label: "Short links", about: "Short links with click counts, UTM tags and QR codes; insert them from the inbox composer." },
  { href: "/settings?tab=activity-log", label: "Activity log", about: "Owners and admins can see who changed roles, API keys, integrations and other sensitive settings." },
  { href: "/settings?tab=appearance", label: "Appearance", about: "Light/dark mode and accent colour." },
  { href: "/docs", label: "Help & docs", about: "Full written guides." },
];

const PAGE_HREFS = new Set(ASSISTANT_PAGES.map((p) => p.href));

export function isAssistantHref(href: string): boolean {
  return PAGE_HREFS.has(href);
}

export function buildAssistantSystemPrompt(): string {
  const map = ASSISTANT_PAGES.map((p) => `- ${p.label} — ${p.href}: ${p.about}`).join("\n");
  return [
    "You are the Repeat Grow help assistant, a small chat bubble inside the Repeat Grow app (a WhatsApp CRM: shared inbox, contacts, pipelines, broadcasts, automations, journeys, flows, AI chatbot, forms, orders, catalog, reports, Shopify, WooCommerce, Calendly, Cal.com and Shiprocket integrations).",
    "You help the signed-in team member USE THE APP. Be friendly, brief (2-6 short sentences or a short numbered list), and practical. Plain text only: no markdown headings, no tables.",
    "",
    "Rules:",
    "- Only use the product map below. If you are not sure something exists or how it works, say so honestly and suggest the Help & docs page. Never invent features, prices, limits or settings.",
    "- You cannot see or change the user's data, send messages, or take actions. Don't claim you did. Tell them where to click instead.",
    "- When a page is relevant, mention it with the exact token [[/path|Label]] using a path from the map (e.g. [[/templates|Templates]]). Use at most 3 such tokens.",
    "- For questions unrelated to using Repeat Grow, politely say you can only help with the app.",
    "- WhatsApp rules to remember: marketing messages outside the 24-hour customer window need an approved template; Meta bills conversations separately.",
    "- Reply in the language the user writes in.",
    "",
    "Product map (pages you may link to):",
    map,
  ].join("\n");
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantResult = { ok: true; reply: string } | { ok: false; error: string };

export async function generateAssistantReply(
  history: AssistantTurn[],
  opts: { apiKey?: string; model?: string; chat?: typeof aiChat } = {},
): Promise<AssistantResult> {
  const apiKey = opts.apiKey ?? aiApiKey();
  if (!apiKey) return { ok: false, error: AI_NOT_CONFIGURED };
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return { ok: false, error: "No question to answer." };
  }
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: buildAssistantSystemPrompt() },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];
    const raw = await (opts.chat ?? aiChat)({
      apiKey,
      model: aiModel(opts.model),
      messages,
      temperature: 0.3,
      maxTokens: 700,
      retries: 1,
    });
    return { ok: true, reply: raw.trim() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Split a reply into text and link parts for rendering. Unknown paths become plain text. */
export type AssistantPart = { type: "text"; text: string } | { type: "link"; href: string; label: string };

export function parseAssistantReply(reply: string): AssistantPart[] {
  const parts: AssistantPart[] = [];
  const re = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
  let last = 0;
  for (const m of reply.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) parts.push({ type: "text", text: reply.slice(last, index) });
    const href = m[1].trim();
    const label = m[2].trim();
    if (isAssistantHref(href)) parts.push({ type: "link", href, label });
    else parts.push({ type: "text", text: label });
    last = index + m[0].length;
  }
  if (last < reply.length) parts.push({ type: "text", text: reply.slice(last) });
  return parts;
}
