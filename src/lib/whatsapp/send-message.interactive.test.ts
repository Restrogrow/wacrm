import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseInteractive,
  validateSendMessageParams,
  SendMessageError,
} from "./send-message";
import { sendInteractiveButtons } from "./meta-api";

// The public API's `type: "interactive"` (POST /api/v1/messages): buttons or a
// list, checked against Meta's limits before any contact / conversation is made.

describe("parseInteractive", () => {
  it("accepts up to 3 buttons with a photo header", () => {
    const p = parseInteractive({
      kind: "buttons",
      buttons: [
        { id: "menu", title: "📋 Menu" },
        { id: "cart", title: "🛒 My order" },
      ],
      header_image_url: "https://example.com/dish.jpg",
    });
    expect(p).toMatchObject({ kind: "buttons", header_image_url: "https://example.com/dish.jpg" });
    expect(p.kind === "buttons" && p.buttons).toHaveLength(2);
  });

  it("accepts a list of rows across sections", () => {
    const p = parseInteractive({
      kind: "list",
      button: "Categories",
      sections: [
        { title: "Food", rows: [{ id: "cat:1", title: "Starters", description: "10 dishes" }] },
        { title: "Drinks", rows: [{ id: "cat:2", title: "Beverages" }] },
      ],
    });
    expect(p.kind).toBe("list");
  });

  const bad: [string, unknown, RegExp][] = [
    ["no object", null, /an object is required/],
    ["unknown kind", { kind: "carousel" }, /kind must be/],
    ["no buttons", { kind: "buttons", buttons: [] }, /1–3 buttons/],
    ["4 buttons", { kind: "buttons", buttons: ["a", "b", "c", "d"].map((x) => ({ id: x, title: x })) }, /1–3 buttons/],
    ["long button title", { kind: "buttons", buttons: [{ id: "a", title: "x".repeat(21) }] }, /title of 1–20/],
    ["duplicate ids", { kind: "buttons", buttons: [{ id: "a", title: "A" }, { id: "a", title: "B" }] }, /duplicate id/],
    ["header image not http", { kind: "buttons", buttons: [{ id: "a", title: "A" }], header_image_url: "javascript:alert(1)" }, /http\(s\)/],
    ["list without label", { kind: "list", sections: [{ rows: [{ id: "a", title: "A" }] }] }, /button \(the list's label\)/],
    ["11 rows", { kind: "list", button: "Pick", sections: [{ rows: Array.from({ length: 11 }, (_, i) => ({ id: "r" + i, title: "Row " + i })) }] }, /at most 10 rows/],
    ["long row title", { kind: "list", button: "Pick", sections: [{ rows: [{ id: "a", title: "x".repeat(25) }] }] }, /title of 1–24/],
    ["untitled sections", { kind: "list", button: "Pick", sections: [{ rows: [{ id: "a", title: "A" }] }, { rows: [{ id: "b", title: "B" }] }] }, /each needs a title/],
  ];
  for (const [name, input, re] of bad) {
    it(`rejects ${name}`, () => {
      expect(() => parseInteractive(input)).toThrow(re);
      try { parseInteractive(input); } catch (e) { expect(e).toBeInstanceOf(SendMessageError); expect((e as SendMessageError).status).toBe(400); }
    });
  }
});

describe("validateSendMessageParams — interactive", () => {
  const buttons = { kind: "buttons", buttons: [{ id: "menu", title: "Menu" }] };

  it("needs the words above the buttons", () => {
    expect(() => validateSendMessageParams({ messageType: "interactive", contentText: "", interactive: buttons })).toThrow(/text is required/);
  });

  it("caps the text at 1024 characters", () => {
    expect(() => validateSendMessageParams({ messageType: "interactive", contentText: "x".repeat(1025), interactive: buttons })).toThrow(/1024/);
  });

  it("passes a good message", () => {
    expect(() => validateSendMessageParams({ messageType: "interactive", contentText: "Hi!", interactive: buttons })).not.toThrow();
  });
});

describe("sendInteractiveButtons — photo header", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the photo as an image header (and drops the text header)", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }));
    await sendInteractiveButtons({
      phoneNumberId: "p", accessToken: "t", to: "919876543210", bodyText: "Paneer Tikka ₹249",
      headerText: "ignored", headerImageUrl: "https://example.com/dish.jpg",
      buttons: [{ id: "add:1", title: "➕ Add" }],
    });
    const interactive = sent.interactive as Record<string, unknown>;
    expect(interactive.header).toEqual({ type: "image", image: { link: "https://example.com/dish.jpg" } });
  });

  it("rejects a header image that is not a web address", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(sendInteractiveButtons({
      phoneNumberId: "p", accessToken: "t", to: "1", bodyText: "b", headerImageUrl: "file:///etc/passwd",
      buttons: [{ id: "a", title: "A" }],
    })).rejects.toThrow(/http\(s\) URL/);
  });
});
