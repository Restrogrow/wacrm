import { describe, expect, it } from "vitest";

import { isNotOnWhatsAppError, statusFromSignal } from "./whatsapp-status";

const at = "2026-10-21T10:00:00Z";

describe("statusFromSignal", () => {
  it("customer messages and delivered/read sends mean on WhatsApp", () => {
    expect(statusFromSignal({ sender_type: "customer", status: "read", created_at: at })).toBe("on");
    expect(statusFromSignal({ sender_type: "agent", status: "delivered", created_at: at })).toBe("on");
    expect(statusFromSignal({ sender_type: "bot", status: "read", created_at: at })).toBe("on");
  });

  it("a 131026 failure means not on WhatsApp", () => {
    expect(statusFromSignal({ sender_type: "agent", status: "failed", error_code: 131026, created_at: at })).toBe("off");
  });

  it("other failures and plain sends say nothing", () => {
    expect(statusFromSignal({ sender_type: "agent", status: "failed", error_code: 131047, created_at: at })).toBeNull();
    expect(statusFromSignal({ sender_type: "agent", status: "sent", created_at: at })).toBeNull();
  });
});

describe("isNotOnWhatsAppError", () => {
  it("matches the stored broadcast error", () => {
    expect(isNotOnWhatsAppError("131026: Message undeliverable")).toBe(true);
    expect(isNotOnWhatsAppError("1310260: something")).toBe(false);
    expect(isNotOnWhatsAppError(null)).toBe(false);
  });
});
