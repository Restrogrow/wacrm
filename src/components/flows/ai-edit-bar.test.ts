import { describe, it, expect } from "vitest";
import { mergeAiNodes } from "./ai-edit-bar";

const prev = [
  { node_key: "start", node_type: "start" as const, config: { next_node_key: "end" }, position_x: 10, position_y: 20 },
  { node_key: "end", node_type: "end" as const, config: {}, position_x: 30, position_y: 40 },
];

describe("mergeAiNodes", () => {
  it("keeps canvas positions when the set of steps is unchanged", () => {
    const merged = mergeAiNodes(prev, [
      { node_key: "end", node_type: "end", config: {} },
      { node_key: "start", node_type: "start", config: { next_node_key: "end" } },
    ]);
    expect(merged.map((n) => [n.node_key, n.position_x, n.position_y])).toEqual([
      ["end", 30, 40],
      ["start", 10, 20],
    ]);
  });

  it("zeroes positions when steps are added so the canvas re-lays out", () => {
    const merged = mergeAiNodes(prev, [
      { node_key: "start", node_type: "start", config: { next_node_key: "hi" } },
      { node_key: "hi", node_type: "send_message", config: { text: "hi", next_node_key: "end" } },
      { node_key: "end", node_type: "end", config: {} },
    ]);
    expect(merged.every((n) => n.position_x === 0 && n.position_y === 0)).toBe(true);
  });
});
