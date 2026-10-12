import { describe, expect, it, vi } from "vitest";

import type { aiChat } from "./gemini";
import { draftTemplateWithAi, reviewRuleIssues, toTemplatePayload } from "./template-draft";

const READY = {
  status: "ready",
  summary: "Order update with a tracking button.",
  template: {
    name: "order_out_for_delivery",
    category: "UTILITY",
    language: "en",
    header: { type: "text", text: "Order update" },
    body: "Hi {{1}}, your order {{2}} is out for delivery and will reach you by {{3}} today. Thank you for ordering with us.",
    body_samples: ["Priya", "#4521", "7:30 PM"],
    footer: "Spice Garden",
    buttons: [{ type: "URL", text: "Track order", url: "https://spicegarden.in/track" }],
  },
};

function chatReturning(...replies: unknown[]) {
  const fn = vi.fn<typeof aiChat>();
  for (const r of replies) fn.mockResolvedValueOnce(typeof r === "string" ? r : JSON.stringify(r));
  return fn;
}

const opts = (chat: ReturnType<typeof chatReturning>) => ({ apiKey: "k", model: "gemini-test", chat });
const MESSAGE = "Hi Priya, your order #4521 is out for delivery, reaches by 7:30 PM. Track: https://spicegarden.in/track";

describe("draftTemplateWithAi", () => {
  it("returns a validated, ready-to-submit draft", async () => {
    const chat = chatReturning("Sure!\n```json\n" + JSON.stringify(READY) + "\n```");
    const res = await draftTemplateWithAi({ message: MESSAGE }, opts(chat));
    expect(res).toMatchObject({ ok: true, status: "ready" });
    if (res.ok && res.status === "ready") {
      expect(res.draft).toMatchObject({
        name: "order_out_for_delivery",
        category: "Utility",
        language: "en",
        header_type: "text",
        header_content: "Order update",
        footer_text: "Spice Garden",
        sample_values: { body: ["Priya", "#4521", "7:30 PM"] },
        buttons: [{ type: "URL", text: "Track order", url: "https://spicegarden.in/track" }],
      });
    }
    expect(chat).toHaveBeenCalledOnce();
  });

  it("asks questions when information is missing", async () => {
    const chat = chatReturning({ status: "needs_info", questions: ["What link should the button open?"] });
    const res = await draftTemplateWithAi({ message: "Book a table with us!" }, opts(chat));
    expect(res).toEqual({ ok: true, status: "needs_info", questions: ["What link should the button open?"] });
  });

  it("passes answers along and doesn't loop on more questions", async () => {
    const chat = chatReturning({ status: "needs_info", questions: ["Again?"] }, READY);
    const res = await draftTemplateWithAi(
      { message: MESSAGE, answers: [{ question: "Link?", answer: "https://spicegarden.in/track" }] },
      opts(chat)
    );
    expect(res).toMatchObject({ ok: true, status: "ready" });
    const firstCall = chat.mock.calls[0][0] as { messages: { content: string }[] };
    expect(firstCall.messages[1].content).toContain("https://spicegarden.in/track");
  });

  it("repairs an invalid draft once using the validator's errors", async () => {
    const bad = { ...READY, template: { ...READY.template, body_samples: ["Priya"] } };
    const chat = chatReturning(bad, READY);
    const res = await draftTemplateWithAi({ message: MESSAGE }, opts(chat));
    expect(res).toMatchObject({ ok: true, status: "ready" });
    const repair = chat.mock.calls[1][0] as { messages: { role: string; content: string }[] };
    expect(repair.messages.at(-1)?.content).toMatch(/sample value/);
  });

  it("gives up with a clear error after a failed repair", async () => {
    const bad = { ...READY, template: { ...READY.template, body: "{{1}} is here" , body_samples: ["x"] } };
    const chat = chatReturning(bad, bad);
    const res = await draftTemplateWithAi({ message: MESSAGE }, opts(chat));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/start with a variable/);
  });

  it("avoids names already taken on the account", async () => {
    const chat = chatReturning(READY, { ...READY, template: { ...READY.template, name: "order_out_for_delivery_2" } });
    const res = await draftTemplateWithAi(
      { message: MESSAGE, existingNames: ["order_out_for_delivery"] },
      opts(chat)
    );
    expect(res.ok && res.status === "ready" && res.draft.name).toBe("order_out_for_delivery_2");
  });

  it("refuses empty input and reports a missing key", async () => {
    expect(await draftTemplateWithAi({ message: "  " }, opts(chatReturning()))).toMatchObject({ ok: false });
    vi.stubEnv("GEMINI_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await draftTemplateWithAi({ message: MESSAGE })).toEqual({
      ok: false,
      error: "AI is not configured (GEMINI_KEY is missing).",
    });
    vi.unstubAllEnvs();
  });
});

describe("helpers", () => {
  it("flags Meta review rules the validator doesn't cover", () => {
    expect(reviewRuleIssues("{{1}} hello there friend")).toContain("The body must not start with a variable.");
    expect(reviewRuleIssues("Hello there friend {{1}}.")).toContain("The body must not end with a variable.");
    expect(reviewRuleIssues("Hi {{1}} {{2}} thanks for visiting us today")).toContain(
      "Two variables must not be side by side."
    );
    expect(reviewRuleIssues("Hi {{1}}, your table is booked for tonight. See you soon!")).toEqual([]);
  });

  it("never produces an Authentication template and cleans the name", () => {
    const p = toTemplatePayload({ ...READY.template, category: "AUTHENTICATION", name: "Order Update!!" });
    expect(p.category).toBe("Marketing");
    expect(p.name).toBe("order_update");
  });
});
