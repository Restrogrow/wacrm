import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/flows/admin-client", () => ({ supabaseAdmin: () => ({}) }));

import { inboundMediaPath, isValidMediaId } from "./inbound-media";

describe("inbound media paths", () => {
  it("accepts Meta media ids and rejects path tricks", () => {
    expect(isValidMediaId("1234567890123456")).toBe(true);
    expect(isValidMediaId("abc_DEF-123")).toBe(true);
    expect(isValidMediaId("../other-account/1")).toBe(false);
    expect(isValidMediaId("a/b")).toBe(false);
    expect(isValidMediaId("")).toBe(false);
  });

  it("scopes objects to the account folder", () => {
    expect(inboundMediaPath("acc-1", "987")).toBe("account-acc-1/987");
  });
});
