import { describe, it, expect } from "vitest";
import { triggerMatches } from "./engine";
import type { Automation } from "@/types";

const auto = (trigger_type: string, trigger_config: Record<string, unknown>) =>
  ({ trigger_type, trigger_config }) as unknown as Automation;

describe("triggerMatches — tag_added", () => {
  it("fires only for the configured tag", () => {
    const a = auto("tag_added", { tag_id: "vip" });
    expect(triggerMatches(a, { tag_id: "vip" })).toBe(true);
    expect(triggerMatches(a, { tag_id: "other" })).toBe(false);
    expect(triggerMatches(a, {})).toBe(false);
  });

  it("never fires when the automation has no tag configured", () => {
    expect(triggerMatches(auto("tag_added", {}), { tag_id: "vip" })).toBe(false);
  });
});
