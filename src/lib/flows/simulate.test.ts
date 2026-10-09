import { describe, it, expect } from "vitest";
import { startSimulation, tapReply, typeText, type SimNode } from "./simulate";

const nodes: SimNode[] = [
  { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
  {
    node_key: "welcome",
    node_type: "send_buttons",
    config: {
      text: "Hi! What do you need?",
      buttons: [
        { reply_id: "order", title: "Order", next_node_key: "tag_order" },
        { reply_id: "book", title: "Book", next_node_key: "ask_date" },
      ],
    },
  },
  { node_key: "tag_order", node_type: "set_tag", config: { mode: "add", tag_id: "t1", next_node_key: "site" } },
  {
    node_key: "site",
    node_type: "send_message",
    config: { text: "Order online", link_label: "View Menu", link_url: "https://x.in", next_node_key: "end" },
  },
  {
    node_key: "ask_date",
    node_type: "collect_input",
    config: { prompt_text: "Which date?", var_key: "date", next_node_key: "confirm" },
  },
  { node_key: "confirm", node_type: "send_message", config: { text: "Booked for {{vars.date}}", next_node_key: "team" } },
  { node_key: "team", node_type: "handoff", config: { note: "booking" } },
  { node_key: "end", node_type: "end", config: {} },
];

describe("flow simulator", () => {
  it("starts at the entry and waits on the first prompt", () => {
    const s = startSimulation(nodes, "start");
    expect(s.status).toBe("waiting_tap");
    expect(s.current).toBe("welcome");
    expect(s.messages.at(-1)).toMatchObject({ kind: "buttons" });
  });

  it("follows a tap through tags and link messages to the end", () => {
    let s = startSimulation(nodes, "start", { t1: "Wants: Order" });
    s = tapReply(nodes, s, "order", { t1: "Wants: Order" });
    expect(s.status).toBe("ended");
    expect(s.tags).toEqual(["t1"]);
    expect(s.messages.map((m) => ("text" in m ? m.text : ""))).toContain("🏷️ Tag added: Wants: Order");
    expect(s.messages.find((m) => m.from === "bot" && m.kind === "text" && m.link)).toBeTruthy();
  });

  it("captures typed input and interpolates it", () => {
    let s = startSimulation(nodes, "start");
    s = tapReply(nodes, s, "book");
    expect(s.status).toBe("waiting_text");
    s = typeText(nodes, s, "  12 Oct ");
    expect(s.vars.date).toBe("12 Oct");
    expect(s.status).toBe("handed_off");
    expect(s.messages.some((m) => m.from === "bot" && m.kind === "text" && m.text === "Booked for 12 Oct")).toBe(true);
  });

  it("reprompts on typed text at a button step, then hands off", () => {
    let s = startSimulation(nodes, "start");
    s = typeText(nodes, s, "pizza?");
    expect(s.status).toBe("waiting_tap");
    s = typeText(nodes, s, "hello?");
    expect(s.status).toBe("waiting_tap");
    s = typeText(nodes, s, "anyone?");
    expect(s.status).toBe("handed_off");
  });

  it("stops on an auto-advance loop instead of spinning", () => {
    const looped: SimNode[] = [
      { node_key: "start", node_type: "start", config: { next_node_key: "msg" } },
      { node_key: "msg", node_type: "send_message", config: { text: "hi", next_node_key: "start" } },
    ];
    const s = startSimulation(looped, "start");
    expect(s.status).toBe("error");
    expect(s.messages.filter((m) => m.from === "bot")).toHaveLength(1);
  });

  it("reports a missing next step", () => {
    const s = startSimulation(
      [{ node_key: "start", node_type: "start", config: { next_node_key: "" } }],
      "start",
    );
    expect(s.status).toBe("error");
  });
});
