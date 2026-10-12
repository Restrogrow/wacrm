import { describe, expect, it, vi } from "vitest";

import type { aiChat } from "@/lib/ai/gemini";
import {
  buildChatbotSystemPrompt,
  CHATBOT_REPLY_SCHEMA,
  DEFAULT_CHATBOT_SETTINGS,
  describeNow,
  generateChatbotReply,
  parseChatbotReply,
  shouldBotReply,
  toChatHistory,
  toWhatsAppFormatting,
  type ReplyDecisionInput,
} from "./chatbot";
import { stillLatest } from "./respond";

const settings = { ...DEFAULT_CHATBOT_SETTINGS, enabled: true, knowledge_base: "Open 11am-11pm daily." };

describe("WhatsApp formatting", () => {
  it("converts Markdown links, bullets and extra blank lines", () => {
    expect(toWhatsAppFormatting("See [our menu](https://x.in/menu)")).toBe("See our menu: https://x.in/menu");
    expect(toWhatsAppFormatting("[https://x.in](https://x.in)")).toBe("https://x.in");
    expect(toWhatsAppFormatting("We have:\n- Thali\n* Lassi")).toBe("We have:\n• Thali\n• Lassi");
    expect(toWhatsAppFormatting("a\n\n\n\nb")).toBe("a\n\nb");
    // WhatsApp *bold* stays intact
    expect(toWhatsAppFormatting("*Open* today")).toBe("*Open* today");
  });
});

describe("reply parsing", () => {
  it("salvages the reply from truncated JSON instead of handing off", () => {
    expect(parseChatbotReply('{"reply": "We are open till 11pm \\ud83d\\ude42", "handoff": fal')).toEqual({
      reply: "We are open till 11pm 🙂",
      handoff: false,
    });
    expect(parseChatbotReply('{"reply":"Connecting you","handoff":true')).toEqual({
      reply: "Connecting you",
      handoff: true,
    });
  });
});

describe("context", () => {
  it("puts the current local time and customer name in the prompt", () => {
    const prompt = buildChatbotSystemPrompt(settings, {
      customerName: "Priya",
      now: new Date("2026-10-13T14:15:00Z"),
      timeZone: "Asia/Kolkata",
    });
    expect(prompt).toContain("Tuesday, 13 October 2026");
    expect(prompt).toContain("7:45 pm");
    expect(prompt).toContain("Priya");
    expect(prompt).toContain("never say you placed, booked");
  });

  it("falls back to the default zone for an invalid one", () => {
    expect(describeNow(new Date("2026-10-13T14:15:00Z"), "Not/AZone")).toContain("(Asia/Kolkata)");
  });

  it("keeps media in the history as placeholders", () => {
    expect(
      toChatHistory([
        { sender_type: "customer", content_text: null, content_type: "audio" },
        { sender_type: "customer", content_text: "my receipt", content_type: "image" },
        { sender_type: "bot", content_text: "Thanks!", content_type: "text" },
      ])
    ).toEqual([
      { role: "user", content: "[sent a voice message]" },
      { role: "user", content: "[sent a photo] my receipt" },
      { role: "assistant", content: "Thanks!" },
    ]);
  });
});

describe("reply decision", () => {
  const base: ReplyDecisionInput = {
    settings,
    flowConsumed: false,
    isText: false,
    text: "",
    conversationStatus: "open",
    assignedAgentId: null,
    lastAgentMessageAt: null,
    lastBotMessageAt: null,
    botMessagesLastHour: 0,
    now: Date.now(),
  };

  it("answers media (to ask the customer to type) but not button taps", () => {
    expect(shouldBotReply({ ...base, isMedia: true }).reply).toBe(true);
    expect(shouldBotReply({ ...base, isMedia: false }).reply).toBe(false);
    expect(shouldBotReply({ ...base, isMedia: true, flowConsumed: true }).reply).toBe(false);
  });
});

describe("debounce", () => {
  const msg = (id: string, sender_type: string) => ({ id, sender_type });

  it("answers only if our customer message is still the newest", () => {
    expect(stillLatest(msg("m1", "customer"), msg("m1", "customer"))).toBe(true);
    // customer sent another message: that webhook answers both
    expect(stillLatest(msg("m1", "customer"), msg("m2", "customer"))).toBe(false);
    // an automation or teammate already replied
    expect(stillLatest(msg("m1", "customer"), msg("m3", "bot"))).toBe(false);
    expect(stillLatest(msg("m1", "customer"), msg("m3", "agent"))).toBe(false);
    expect(stillLatest(null, msg("m1", "customer"))).toBe(false);
  });
});

describe("generateChatbotReply", () => {
  it("asks Gemini for schema-checked JSON with a retry, and returns the reply", async () => {
    const chat = vi.fn<typeof aiChat>().mockResolvedValue('{"reply":"Yes, we are open till 11pm!","handoff":false}');
    const res = await generateChatbotReply(settings, [{ role: "user", content: "open now?" }], {
      apiKey: "k",
      chat,
      context: { customerName: "Priya" },
    });
    expect(res).toEqual({ ok: true, reply: "Yes, we are open till 11pm!", handoff: false });
    const call = chat.mock.calls[0][0];
    expect(call.responseSchema).toBe(CHATBOT_REPLY_SCHEMA);
    expect(call.retries).toBe(1);
    expect(call.messages[0].content).toContain("Priya");
  });

  it("reports AI failures instead of throwing", async () => {
    const chat = vi.fn<typeof aiChat>().mockRejectedValue(new Error("AI request failed (500): boom"));
    const res = await generateChatbotReply(settings, [{ role: "user", content: "hi" }], { apiKey: "k", chat });
    expect(res).toEqual({ ok: false, error: "AI request failed (500): boom" });
  });
});
