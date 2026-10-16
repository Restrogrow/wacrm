import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_PAGES,
  buildAssistantSystemPrompt,
  generateAssistantReply,
  isAssistantHref,
  parseAssistantReply,
} from "./app-assistant";

describe("parseAssistantReply", () => {
  it("turns known [[path|Label]] tokens into links and keeps the text", () => {
    const parts = parseAssistantReply("Go to [[/templates|Templates]] first, then [[/broadcasts|Broadcasts]].");
    expect(parts).toEqual([
      { type: "text", text: "Go to " },
      { type: "link", href: "/templates", label: "Templates" },
      { type: "text", text: " first, then " },
      { type: "link", href: "/broadcasts", label: "Broadcasts" },
      { type: "text", text: "." },
    ]);
  });

  it("drops links to pages that are not in the product map", () => {
    const parts = parseAssistantReply("See [[https://evil.example|Click me]] now");
    expect(parts.some((p) => p.type === "link")).toBe(false);
    expect(parts.map((p) => (p.type === "text" ? p.text : "")).join("")).toContain("Click me");
  });

  it("returns plain text untouched", () => {
    expect(parseAssistantReply("Just text")).toEqual([{ type: "text", text: "Just text" }]);
  });
});

describe("assistant product map", () => {
  it("mentions every page in the system prompt", () => {
    const prompt = buildAssistantSystemPrompt();
    for (const page of ASSISTANT_PAGES) expect(prompt).toContain(page.href);
  });

  it("only allows mapped hrefs", () => {
    expect(isAssistantHref("/orders")).toBe(true);
    expect(isAssistantHref("/admin")).toBe(false);
  });
});

describe("generateAssistantReply", () => {
  it("sends the system prompt plus history and returns the trimmed reply", async () => {
    const chat = vi.fn().mockResolvedValue("  Open [[/broadcasts|Broadcasts]].  ");
    const result = await generateAssistantReply([{ role: "user", content: "How do I send a broadcast?" }], {
      apiKey: "test-key",
      chat,
    });
    expect(result).toEqual({ ok: true, reply: "Open [[/broadcasts|Broadcasts]]." });
    const args = chat.mock.calls[0][0];
    expect(args.messages[0].role).toBe("system");
    expect(args.messages[1]).toEqual({ role: "user", content: "How do I send a broadcast?" });
  });

  it("refuses when there is no question or no key", async () => {
    expect(await generateAssistantReply([], { apiKey: "k" })).toMatchObject({ ok: false });
    expect(
      await generateAssistantReply([{ role: "assistant", content: "hi" }], { apiKey: "k" }),
    ).toMatchObject({ ok: false });
  });

  it("surfaces AI errors instead of throwing", async () => {
    const chat = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await generateAssistantReply([{ role: "user", content: "hi" }], { apiKey: "k", chat });
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
