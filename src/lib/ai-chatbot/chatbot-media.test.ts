import { describe, expect, it, vi } from "vitest";

import type { aiChat } from "@/lib/ai/gemini";
import { buildChatbotSystemPrompt, generateChatbotReply, normalizeChatbotSettings } from "./chatbot";
import { pickCustomerMedia } from "./respond";

const row = (sender_type: string, content_type: string | null, media_url: string | null = null) => ({
  sender_type,
  content_type,
  media_url,
});

describe("pickCustomerMedia", () => {
  it("takes the newest photo or voice note from the customer's latest burst", () => {
    expect(
      pickCustomerMedia([
        row("customer", "text"),
        row("customer", "audio", "/api/whatsapp/media/111"),
        row("customer", "image", "/api/whatsapp/media/222"),
      ]),
    ).toEqual({ kind: "voice message", mediaId: "111" });
    expect(pickCustomerMedia([row("customer", "image", "/api/whatsapp/media/9")])).toEqual({ kind: "photo", mediaId: "9" });
  });

  it("ignores media from before the last agent or bot reply, and other media types", () => {
    expect(pickCustomerMedia([row("customer", "text"), row("bot", "text"), row("customer", "image", "/api/whatsapp/media/1")])).toBeNull();
    expect(pickCustomerMedia([row("customer", "video", "/api/whatsapp/media/5"), row("customer", "document", "/api/whatsapp/media/6")])).toBeNull();
    expect(pickCustomerMedia([row("customer", "image", null)])).toBeNull();
  });
});

describe("chatbot with media", () => {
  const settings = normalizeChatbotSettings({ enabled: true, knowledge_base: "We sell kurtas." });

  it("tells the model to listen to an attached voice note", () => {
    const prompt = buildChatbotSystemPrompt(settings, { attachedMedia: "voice message" });
    expect(prompt).toContain("latest voice message is attached");
    expect(buildChatbotSystemPrompt(settings)).not.toContain("is attached");
  });

  it("sends the media inline and tags usage with the account", async () => {
    const chat = vi.fn(async () => '{"reply":"Yes, we have it","handoff":false}') as unknown as typeof aiChat;
    const out = await generateChatbotReply(settings, [{ role: "user", content: "[sent a photo]" }], {
      apiKey: "k",
      chat,
      accountId: "acc-1",
      media: { mimeType: "image/jpeg", data: "AAAA" },
      context: { attachedMedia: "photo" },
    });
    expect(out).toEqual({ ok: true, reply: "Yes, we have it", handoff: false });
    const opts = (chat as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(opts.inlineData).toEqual({ mimeType: "image/jpeg", data: "AAAA" });
    expect(opts.track).toEqual({ feature: "chatbot", accountId: "acc-1" });
    expect(opts.messages[0].content).toContain("latest photo is attached");
  });
});
