import { describe, it, expect } from "vitest";
import {
  buildChatbotSystemPrompt,
  stripPlaceholders,
  toWhatsAppFormatting,
  DEFAULT_CHATBOT_SETTINGS,
  MAX_BOT_MESSAGES_PER_HOUR,
  normalizeChatbotSettings,
  parseChatbotReply,
  shouldBotReply,
  toChatHistory,
  type ReplyDecisionInput,
} from "./chatbot";

const now = Date.parse("2026-10-09T12:00:00Z");
const base: ReplyDecisionInput = {
  settings: { ...DEFAULT_CHATBOT_SETTINGS, enabled: true, knowledge_base: "Open 11-11" },
  flowConsumed: false,
  isText: true,
  text: "what are your timings?",
  conversationStatus: "open",
  assignedAgentId: null,
  lastAgentMessageAt: null,
  lastBotMessageAt: null,
  botMessagesLastHour: 0,
  now,
};
const why = (patch: Partial<ReplyDecisionInput>) => {
  const d = shouldBotReply({ ...base, ...patch });
  return d.reply ? "reply" : d.reason;
};

describe("shouldBotReply", () => {
  it("replies to a plain question on an open chat", () => {
    expect(why({})).toBe("reply");
  });

  it("stays off when disabled, unconfigured or empty", () => {
    expect(why({ settings: null })).toBe("disabled");
    expect(why({ settings: { ...base.settings!, enabled: false } })).toBe("disabled");
    expect(why({ settings: { ...base.settings!, knowledge_base: "  " } })).toBe("empty_knowledge_base");
  });

  it("lets flows go first and ignores taps/media", () => {
    expect(why({ flowConsumed: true })).toBe("flow_handled");
    expect(why({ isText: false })).toBe("not_text");
    expect(why({ text: "   " })).toBe("not_text");
  });

  it("waits after a hand-off, then resumes if nobody picked it up", () => {
    const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
    expect(why({ conversationStatus: "pending" })).toBe("handed_off");
    expect(why({ conversationStatus: "pending", lastBotMessageAt: ago(1) })).toBe("handed_off");
    expect(why({ conversationStatus: "pending", lastBotMessageAt: ago(3) })).toBe("reply");
  });

  it("stays quiet while humans own the chat", () => {
    expect(why({ assignedAgentId: "agent-1" })).toBe("assigned_to_agent");
    expect(why({ lastAgentMessageAt: new Date(now - 10 * 60_000).toISOString() })).toBe("agent_recently_active");
    expect(why({ lastAgentMessageAt: new Date(now - 31 * 60_000).toISOString() })).toBe("reply");
  });

  it("caps runaway conversations", () => {
    expect(why({ botMessagesLastHour: MAX_BOT_MESSAGES_PER_HOUR })).toBe("hourly_cap");
  });
});

describe("parseChatbotReply", () => {
  it("reads the JSON contract", () => {
    expect(parseChatbotReply('{"reply":"We open at 11 🙏","handoff":false}')).toEqual({
      reply: "We open at 11 🙏",
      handoff: false,
    });
    expect(parseChatbotReply('```json\n{"reply":"","handoff":true}\n```')).toEqual({ reply: "", handoff: true });
  });

  it("falls back to prose, and hands off on junk", () => {
    expect(parseChatbotReply("We open at 11.")).toEqual({ reply: "We open at 11.", handoff: false });
    expect(parseChatbotReply('{"oops": 1')).toEqual({ reply: "", handoff: true });
  });
});

describe("knowledge-base hygiene", () => {
  it("hides unfilled [placeholders] from the model", () => {
    expect(stripPlaceholders("Open: [11 AM – 11 PM]\nVeg: yes")).toBe("Open: (not provided)\nVeg: yes");
    expect(buildChatbotSystemPrompt({ ...base.settings!, knowledge_base: "Phone: [+91 XXXXX]" })).not.toContain("XXXXX");
  });

  it("converts Markdown bold to WhatsApp bold", () => {
    expect(toWhatsAppFormatting("**Delivery** across Jaipur")).toBe("*Delivery* across Jaipur");
    expect(parseChatbotReply('{"reply":"## Menu\\n**Thali** ₹299","handoff":false}').reply).toBe("Menu\n*Thali* ₹299");
  });
});

describe("toChatHistory", () => {
  it("maps senders, drops empties and keeps the latest turns", () => {
    const rows = [
      { sender_type: "customer", content_text: "hi" },
      { sender_type: "bot", content_text: "Hello!" },
      { sender_type: "agent", content_text: null },
      { sender_type: "customer", content_text: "menu?" },
    ];
    expect(toChatHistory(rows)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "menu?" },
    ]);
  });
});

describe("normalizeChatbotSettings", () => {
  it("fills defaults and clamps values", () => {
    const s = normalizeChatbotSettings({ enabled: "yes", pause_minutes_after_agent: 999999, bot_name: "  " });
    expect(s.enabled).toBe(false);
    expect(s.pause_minutes_after_agent).toBe(10080);
    expect(s.bot_name).toBe("Assistant");
    expect(s.handoff_message).toBe(DEFAULT_CHATBOT_SETTINGS.handoff_message);
  });
});
