import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  generateFlowFromPrompt,
  normalizeGenerated,
  parseJsonObject,
} from "./ai-generate";

describe("parseJsonObject", () => {
  it("parses a fenced reply with surrounding prose", () => {
    expect(parseJsonObject('Here:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 });
  });

  it("returns null for non-objects and junk", () => {
    expect(parseJsonObject("[1,2]")).toBeNull();
    expect(parseJsonObject("no json here")).toBeNull();
    expect(parseJsonObject("{broken")).toBeNull();
  });
});

describe("normalizeGenerated", () => {
  const tagIds = new Set(["tag-1"]);

  it("fills defaults and keeps valid nodes", () => {
    const { generated, extraIssues } = normalizeGenerated(
      {
        nodes: [
          { node_key: "start", node_type: "start", config: { next_node_key: "end" } },
          { node_key: "end", node_type: "end", config: {} },
        ],
      },
      tagIds,
    );
    expect(extraIssues).toEqual([]);
    expect(generated.flow).toMatchObject({
      name: "AI flow",
      trigger_type: "keyword",
      trigger_config: { keywords: [] },
      entry_node_id: "start",
    });
    expect(generated.nodes).toHaveLength(2);
  });

  it("flags disallowed node types and unknown tag ids", () => {
    const { extraIssues } = normalizeGenerated(
      {
        nodes: [
          { node_key: "m", node_type: "send_media", config: {} },
          { node_key: "t", node_type: "set_tag", config: { tag_id: "nope" } },
          { node_key: "ok", node_type: "set_tag", config: { tag_id: "tag-1" } },
        ],
      },
      tagIds,
    );
    expect(extraIssues.map((i) => i.node_key)).toEqual(["m", "t"]);
  });
});

describe("buildSystemPrompt", () => {
  it("lists account tags, or forbids set_tag when there are none", () => {
    expect(buildSystemPrompt([{ id: "abc", name: "VIP" }])).toContain('"VIP" → tag_id "abc"');
    expect(buildSystemPrompt([])).toContain("do NOT use set_tag");
  });
});

describe("generateFlowFromPrompt", () => {
  it("fails cleanly without an API key", async () => {
    const prev = { a: process.env.API_GROQ, b: process.env.GROQ_API_KEY };
    delete process.env.API_GROQ;
    delete process.env.GROQ_API_KEY;
    try {
      const res = await generateFlowFromPrompt("hi flow", []);
      expect(res).toMatchObject({ ok: false });
    } finally {
      if (prev.a !== undefined) process.env.API_GROQ = prev.a;
      if (prev.b !== undefined) process.env.GROQ_API_KEY = prev.b;
    }
  });
});
