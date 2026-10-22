import { describe, expect, it } from "vitest";
import { isDemoBlockedRequest, isDemoEmail } from "./demo-guard";

describe("isDemoBlockedRequest", () => {
  it.each([
    ["POST", "/api/account/api-keys"],
    ["DELETE", "/api/account/members/123"],
    ["POST", "/api/account/transfer-ownership"],
    ["POST", "/api/whatsapp/config"],
    ["POST", "/api/whatsapp/send"],
    ["POST", "/api/whatsapp/broadcast"],
    ["POST", "/api/whatsapp/forms/abc/send"],
    ["POST", "/api/journeys/abc/enroll"],
    ["PATCH", "/api/integrations/shopify/rules"],
    ["POST", "/api/short-links"],
    ["post", "/api//account/delete"],
  ])("blocks %s %s", (method, path) => {
    expect(isDemoBlockedRequest(path, method)).toBe(true);
  });

  it.each([
    ["GET", "/api/account/members"],
    ["GET", "/api/whatsapp/config"],
    ["POST", "/api/inbox/notes"],
    ["POST", "/api/inbox/conversations/abc/suggest-replies"],
    ["PATCH", "/api/flows/abc"],
    ["POST", "/api/account/onboarding"],
    ["POST", "/api/whatsapp/sender"],
  ])("allows %s %s", (method, path) => {
    expect(isDemoBlockedRequest(path, method)).toBe(false);
  });
});

describe("isDemoEmail", () => {
  it("matches case-insensitively and needs both values", () => {
    expect(isDemoEmail("Demo@Example.com", "demo@example.com")).toBe(true);
    expect(isDemoEmail("other@example.com", "demo@example.com")).toBe(false);
    expect(isDemoEmail(undefined, "demo@example.com")).toBe(false);
    expect(isDemoEmail("demo@example.com", undefined)).toBe(false);
  });
});
