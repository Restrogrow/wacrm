import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  generateFlowFromPrompt,
  NEW_TAG_PREFIX,
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
  const tags = [{ id: "tag-1", name: "VIP" }];

  it("fills defaults and keeps valid nodes", () => {
    const { generated, extraIssues } = normalizeGenerated(
      {
        nodes: [
          { node_key: "start", node_type: "start", config: { next_node_key: "end" } },
          { node_key: "end", node_type: "end", config: {} },
        ],
      },
      tags,
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
      tags,
    );
    expect(extraIssues.map((i) => i.node_key)).toEqual(["m", "t"]);
  });

  it("resolves tag_name to an existing tag or queues a new one", () => {
    const { generated, extraIssues } = normalizeGenerated(
      {
        nodes: [
          { node_key: "a", node_type: "set_tag", config: { mode: "add", tag_name: "vip", next_node_key: "end" } },
          { node_key: "b", node_type: "set_tag", config: { mode: "add", tag_name: "Service: Motel", next_node_key: "end" } },
        ],
      },
      tags,
    );
    expect(extraIssues).toEqual([]);
    expect(generated.nodes[0].config).toEqual({ mode: "add", tag_id: "tag-1", next_node_key: "end" });
    expect(generated.nodes[1].config.tag_id).toBe(`${NEW_TAG_PREFIX}Service: Motel`);
    expect(generated.new_tags).toEqual(["Service: Motel"]);
  });
});

describe("buildSystemPrompt", () => {
  it("lists account tags and defaults the trigger to greetings", () => {
    expect(buildSystemPrompt([{ id: "abc", name: "VIP" }])).toContain('"VIP" → tag_id "abc"');
    expect(buildSystemPrompt([])).toContain("(none yet)");
    expect(buildSystemPrompt([])).toContain('"start"]');
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
