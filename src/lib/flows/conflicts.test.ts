import { describe, it, expect } from "vitest";
import { findTriggerConflicts, overlappingKeywords, type TriggerFlow } from "./conflicts";

const kw = (id: string, keywords: string[], match_type: "exact" | "contains" = "exact"): TriggerFlow => ({
  id,
  name: id,
  trigger_type: "keyword",
  trigger_config: { keywords, match_type },
});

describe("overlappingKeywords", () => {
  it("finds shared exact words, case-insensitively", () => {
    expect(overlappingKeywords(kw("a", ["hi", "menu"]), kw("b", ["HI", "order"]))).toEqual(["hi"]);
  });

  it("catches a contains-trigger that swallows another flow's word", () => {
    // "hello" contains "hell" — b would fire on a's keyword.
    expect(overlappingKeywords(kw("a", ["hello"]), kw("b", ["hell"], "contains"))).toEqual(["hello"]);
  });

  it("returns nothing for disjoint triggers", () => {
    expect(overlappingKeywords(kw("a", ["hi"]), kw("b", ["lead"]))).toEqual([]);
  });
});

describe("findTriggerConflicts", () => {
  it("lists conflicting flows and skips itself", () => {
    const me = kw("me", ["hi", "start"]);
    const res = findTriggerConflicts(me, [me, kw("x", ["hi"]), kw("y", ["faq"])]);
    expect(res).toEqual([{ id: "x", name: "x", words: ["hi"], reason: "keyword" }]);
  });

  it("flags two first-message flows", () => {
    const first = (id: string): TriggerFlow => ({
      id,
      name: id,
      trigger_type: "first_inbound_message",
      trigger_config: {},
    });
    expect(findTriggerConflicts(first("a"), [first("b")])[0]?.reason).toBe("first_inbound_message");
  });
});
