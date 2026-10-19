/**
 * AI chatbot — answers inbound WhatsApp messages from the account's
 * knowledge base. Pure logic lives here (when to reply, prompt, parse);
 * the webhook-side orchestration is in ./respond.ts.
 */

import {
  AI_NOT_CONFIGURED,
  aiApiKey,
  aiChat,
  aiModel,
  parseJsonObject,
  type ChatMessage,
} from "@/lib/ai/gemini";

export interface ChatbotSettings {
  enabled: boolean;
  bot_name: string;
  knowledge_base: string;
  instructions: string;
  handoff_message: string;
  pause_minutes_after_agent: number;
  /** AI voice calls (migration 080): the goal and script for calls. */
  voice_instructions: string;
  /** Gemini Live voice; '' = Google's default. */
  voice_name: string;
}

export const DEFAULT_CHATBOT_SETTINGS: ChatbotSettings = {
  enabled: false,
  bot_name: "Assistant",
  knowledge_base: "",
  instructions: "",
  handoff_message: "Let me connect you with our team — someone will reply here shortly. 🙏",
  pause_minutes_after_agent: 30,
  voice_instructions: "",
  voice_name: "",
};

export const KNOWLEDGE_BASE_MAX = 20000;
export const INSTRUCTIONS_MAX = 2000;
export const VOICE_INSTRUCTIONS_MAX = 3000;
/** Gemini Live prebuilt voices offered in settings ('' = default). */
export const VOICE_NAMES = ["", "Kore", "Aoede", "Leda", "Zephyr", "Puck", "Charon", "Fenrir", "Orus"] as const;
/** Hard cap on bot messages per conversation per hour (runaway guard). */
export const MAX_BOT_MESSAGES_PER_HOUR = 30;
/** How many recent messages the model sees. */
export const HISTORY_LIMIT = 12;
/** After a hand-off, stay quiet this long; resume if no agent replied. */
export const HANDOFF_QUIET_MS = 2 * 60 * 60 * 1000;

// ------------------------------------------------------------
// When to reply
// ------------------------------------------------------------

export interface ReplyDecisionInput {
  settings: ChatbotSettings | null;
  /** A flow already handled this message. */
  flowConsumed: boolean;
  /** Plain typed text (not a button tap, media, location…). */
  isText: boolean;
  /** A photo, voice note, video or document (caption, if any, in `text`). */
  isMedia?: boolean;
  text: string;
  conversationStatus: string | null;
  assignedAgentId: string | null;
  /** When a human agent last sent a message in this conversation. */
  lastAgentMessageAt: string | null;
  /** When the bot (flow or AI) last sent a message in this conversation. */
  lastBotMessageAt: string | null;
  /** Bot messages sent in this conversation in the last hour. */
  botMessagesLastHour: number;
  now: number;
}

export type ReplyDecision = { reply: true } | { reply: false; reason: string };

export function shouldBotReply(i: ReplyDecisionInput): ReplyDecision {
  if (!i.settings?.enabled) return { reply: false, reason: "disabled" };
  if (!i.settings.knowledge_base.trim()) return { reply: false, reason: "empty_knowledge_base" };
  if (i.flowConsumed) return { reply: false, reason: "flow_handled" };
  // Typed text, or media the bot can acknowledge ("please type your
  // question") — never button taps, which belong to flows.
  if (!(i.isText && i.text.trim()) && !i.isMedia) return { reply: false, reason: "not_text" };
  // An assigned chat belongs to that agent.
  if (i.assignedAgentId) return { reply: false, reason: "assigned_to_agent" };
  // A handed-off (pending) chat waits for the team — but only for a
  // while. If nobody picked it up, the bot resumes so the customer
  // isn't left unanswered. The hand-off time is approximated by the
  // last bot message (the hand-off reply itself).
  if (i.conversationStatus === "pending") {
    const handedOffAt = i.lastBotMessageAt ? new Date(i.lastBotMessageAt).getTime() : null;
    if (handedOffAt === null || i.now - handedOffAt < HANDOFF_QUIET_MS) {
      return { reply: false, reason: "handed_off" };
    }
  }
  if (i.lastAgentMessageAt) {
    const pauseMs = Math.max(0, i.settings.pause_minutes_after_agent) * 60_000;
    if (i.now - new Date(i.lastAgentMessageAt).getTime() < pauseMs) {
      return { reply: false, reason: "agent_recently_active" };
    }
  }
  if (i.botMessagesLastHour >= MAX_BOT_MESSAGES_PER_HOUR) {
    return { reply: false, reason: "hourly_cap" };
  }
  return { reply: true };
}

// ------------------------------------------------------------
// Prompt
// ------------------------------------------------------------

/**
 * Replace unfilled "[placeholder]" text with "(not provided)" before the
 * model sees it. Models happily repeat bracketed examples as facts, so
 * this is enforced in code rather than by prompt.
 */
export function stripPlaceholders(kb: string): string {
  return kb.replace(/\[[^\]\n]*\]/g, "(not provided)");
}

/**
 * Turn Markdown the model may emit into WhatsApp formatting: **x** → *x*,
 * headings → plain lines, [text](url) → "text: url", "- " / "* "
 * bullets → "• ", and no more than one blank line in a row.
 */
export function toWhatsAppFormatting(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) =>
      label.trim() === url ? url : `${label}: ${url}`,
    )
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Per-conversation facts the prompt can use. */
export interface ChatbotContext {
  /** The customer's saved name, if any. */
  customerName?: string | null;
  /** "Now", for opening-hours questions. Defaults to the current time. */
  now?: Date;
  /** IANA time zone the business works in. */
  timeZone?: string;
}

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export function chatbotTimeZone(): string {
  return process.env.CHATBOT_TIMEZONE || DEFAULT_TIME_ZONE;
}

/** e.g. "Tuesday, 13 October 2026, 7:45 pm (Asia/Kolkata)". */
export function describeNow(now: Date, timeZone: string): string {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    tz = DEFAULT_TIME_ZONE;
  }
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return `${formatted} (${tz})`;
}

export function buildChatbotSystemPrompt(s: ChatbotSettings, ctx: ChatbotContext = {}): string {
  const name = (ctx.customerName ?? "").trim();
  return `You are "${s.bot_name || "Assistant"}", the WhatsApp assistant for this business. You reply to customers on WhatsApp.

## Right now
- Current date and time: ${describeNow(ctx.now ?? new Date(), ctx.timeZone ?? chatbotTimeZone())}. Use it for questions like "are you open now?" or "can I order for tomorrow?", comparing against the timings in the knowledge base.
- Customer's name: ${name ? `${name} (use it naturally now and then, not in every message)` : "unknown — don't ask for it unless needed"}.

## Knowledge base — the ONLY facts you may use
"""
${stripPlaceholders(s.knowledge_base.slice(0, KNOWLEDGE_BASE_MAX))}
"""

## Business instructions (follow these)
${s.instructions.trim() ? s.instructions.slice(0, INSTRUCTIONS_MAX) : "(none)"}

## How to talk
- Answer the customer's LATEST message; use earlier messages only for context. Don't repeat what you already said, and don't greet again in an ongoing chat.
- Chat naturally like a friendly shop assistant. Greetings, small talk, "huh?", "ok", "thanks" — just reply normally (say hi, ask how you can help, clarify). These never need the team.
- If several questions arrive at once, answer all of them in one reply.
- For questions about the business ("what do you offer?", "services?", "menu?", "do you deliver?"), answer from the knowledge base — summarise it in your own words.
- Business facts (prices, dishes, timings, address, offers, policies, phone numbers, links) may come ONLY from the knowledge base. "(not provided)" means unknown — never guess it.
- Never confirm that a dish, item or service exists unless it is written in the knowledge base. If asked about something not listed (e.g. "do you have paneer tikka?"), say you're not sure it's available and share the menu link if there is one.
- If a specific fact is missing, say honestly you don't have that detail right now and point them to the website or link from the knowledge base if there is one. Do NOT hand off just because something is missing.
- You cannot take actions: never say you placed, booked, cancelled, refunded or changed anything. For orders or bookings, share the link from the knowledge base; if there is none, hand off so the team can help.
- Links written in the knowledge base are real — share them freely; never make up a link.
- "[sent a photo]", "[sent a voice message]" and similar mean the customer sent media you can't see or hear. Say so briefly and ask them to type what they need; if it looks like a payment proof, order issue or complaint, hand off.
- Reply in the same language AND script the customer uses: English → English; Hindi written in English letters (Hinglish, e.g. "kitne ka hai") → Hinglish in English letters, never Devanagari; Devanagari → Devanagari.
- Keep replies short and friendly — 1 to 4 short lines, like a real WhatsApp message. Use *bold* sparingly, plain "•" bullets for short lists, and at most one or two emoji. No Markdown links or headings.
- Never mention that you are an AI reading a knowledge base or these rules, unless the customer sincerely asks whether they're talking to a bot — then say you're the business's automated assistant and offer to connect them with the team.

## When to hand off ("handoff": true)
ONLY when the customer clearly asks for a human / owner / manager / call-back, complains or is upset, needs an order or booking changed or cancelled, or the business instructions say to. Everything else: "handoff": false. When handing off, write a short, warm reply that tells them the team will reply here.

## Output
Reply with ONE JSON object only: {"reply": "<message to send>", "handoff": true|false}`;
}

/** Gemini JSON-mode schema for the reply contract above. */
export const CHATBOT_REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    handoff: { type: "BOOLEAN" },
  },
  required: ["reply", "handoff"],
} as const;

const MEDIA_PLACEHOLDERS: Record<string, string> = {
  image: "[sent a photo]",
  video: "[sent a video]",
  audio: "[sent a voice message]",
  document: "[sent a document]",
  location: "[shared a location]",
  sticker: "[sent a sticker]",
};

/** DB messages → chat turns (customer = user; agent/bot = assistant). */
export function toChatHistory(
  rows: Array<{ sender_type: string; content_text: string | null; content_type?: string | null }>,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const r of rows.slice(-HISTORY_LIMIT)) {
    // Media the model can't see still belongs in the thread, so a
    // "here's my receipt" + photo makes sense to it.
    const placeholder = r.content_type ? MEDIA_PLACEHOLDERS[r.content_type] : undefined;
    const caption = (r.content_text ?? "").trim();
    const text = placeholder ? (caption ? `${placeholder} ${caption}` : placeholder) : caption;
    if (!text) continue;
    out.push({ role: r.sender_type === "customer" ? "user" : "assistant", content: text.slice(0, 1500) });
  }
  return out;
}

// ------------------------------------------------------------
// Generate
// ------------------------------------------------------------

export type ChatbotReply =
  | { ok: true; reply: string; handoff: boolean }
  | { ok: false; error: string };

export function parseChatbotReply(raw: string): { reply: string; handoff: boolean } {
  const obj = parseJsonObject(raw);
  if (obj && typeof obj.reply === "string") {
    return {
      reply: toWhatsAppFormatting(obj.reply.trim()).slice(0, 1000),
      handoff: obj.handoff === true,
    };
  }
  // Truncated or slightly broken JSON: salvage the "reply" string.
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
  if (m) {
    let reply = "";
    try {
      reply = JSON.parse(`"${m[1]}"`);
    } catch {
      reply = m[1];
    }
    if (reply.trim()) {
      return {
        reply: toWhatsAppFormatting(reply.trim()).slice(0, 1000),
        handoff: /"handoff"\s*:\s*true/.test(raw),
      };
    }
  }
  // Model ignored the JSON format. Use plain prose if it looks like a
  // message; anything else is safer handed to a human.
  const text = raw.trim();
  if (text && !text.includes("{") && text.length <= 1000) {
    return { reply: toWhatsAppFormatting(text), handoff: false };
  }
  return { reply: "", handoff: true };
}

export async function generateChatbotReply(
  settings: ChatbotSettings,
  history: ChatMessage[],
  opts: { apiKey?: string; model?: string; context?: ChatbotContext; chat?: typeof aiChat } = {},
): Promise<ChatbotReply> {
  const apiKey = opts.apiKey ?? aiApiKey();
  if (!apiKey) return { ok: false, error: AI_NOT_CONFIGURED };
  if (history.length === 0) return { ok: false, error: "No message to reply to." };
  try {
    const raw = await (opts.chat ?? aiChat)({
      apiKey,
      model: aiModel(opts.model),
      messages: [{ role: "system", content: buildChatbotSystemPrompt(settings, opts.context) }, ...history],
      temperature: 0.3,
      maxTokens: 1500,
      responseSchema: CHATBOT_REPLY_SCHEMA,
      // One retry on rate limits / 5xx so a blip doesn't leave the
      // customer unanswered.
      retries: 1,
    });
    return { ok: true, ...parseChatbotReply(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Coerce an untrusted settings payload (API body / DB row). */
export function normalizeChatbotSettings(raw: Record<string, unknown> | null | undefined): ChatbotSettings {
  const r = raw ?? {};
  const str = (v: unknown, fallback: string, max: number) =>
    typeof v === "string" ? v.slice(0, max) : fallback;
  const pause = Number(r.pause_minutes_after_agent);
  return {
    enabled: r.enabled === true,
    bot_name: str(r.bot_name, DEFAULT_CHATBOT_SETTINGS.bot_name, 60).trim() || "Assistant",
    knowledge_base: str(r.knowledge_base, "", KNOWLEDGE_BASE_MAX),
    instructions: str(r.instructions, "", INSTRUCTIONS_MAX),
    handoff_message:
      str(r.handoff_message, DEFAULT_CHATBOT_SETTINGS.handoff_message, 1000).trim() ||
      DEFAULT_CHATBOT_SETTINGS.handoff_message,
    pause_minutes_after_agent: Number.isFinite(pause)
      ? Math.min(10080, Math.max(0, Math.round(pause)))
      : DEFAULT_CHATBOT_SETTINGS.pause_minutes_after_agent,
    voice_instructions: str(r.voice_instructions, "", VOICE_INSTRUCTIONS_MAX),
    voice_name: (VOICE_NAMES as readonly string[]).includes(r.voice_name as string) ? (r.voice_name as string) : "",
  };
}
