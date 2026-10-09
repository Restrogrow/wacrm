/**
 * In-browser flow simulator for the editor's Preview panel.
 *
 * Walks the same node graph the runner does (engine.ts) but with no DB
 * and no WhatsApp: bot sends become transcript entries, set_tag/handoff
 * become system notes. It mirrors the runner's rules that matter to an
 * author — auto-advance vs suspend, button/list routing, collect_input
 * capture, {{vars.x}} interpolation, the cycle guard — so what you see
 * here is what a customer gets.
 *
 * Pure and immutable: every step returns a new SimState.
 */

export interface SimNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
}

export interface SimButton {
  reply_id: string;
  title: string;
}

export interface SimListSection {
  title?: string;
  rows: Array<SimButton & { description?: string }>;
}

export type SimMessage =
  | { from: "bot"; kind: "text"; text: string; link?: { label: string; url: string } }
  | {
      from: "bot";
      kind: "buttons";
      text: string;
      header?: string;
      footer?: string;
      buttons: SimButton[];
    }
  | {
      from: "bot";
      kind: "list";
      text: string;
      header?: string;
      footer?: string;
      button_label: string;
      sections: SimListSection[];
    }
  | { from: "bot"; kind: "media"; media_type: string; url: string; caption?: string }
  | { from: "user"; text: string }
  | { from: "system"; text: string; tone?: "info" | "warn" | "error" };

export type SimStatus = "waiting_tap" | "waiting_text" | "ended" | "handed_off" | "error";

export interface SimState {
  status: SimStatus;
  /** Node the simulated run is suspended at (send_buttons/list/collect_input). */
  current: string | null;
  vars: Record<string, string>;
  /** Tag ids added during this preview — feeds tag conditions. */
  tags: string[];
  messages: SimMessage[];
  reprompts: number;
}

const MAX_REPROMPTS = 2;

function interpolate(text: string, vars: Record<string, string>): string {
  return (text ?? "").replace(/\{\{vars\.([a-zA-Z0-9_]+)\}\}/g, (_, k) => vars[k] ?? "");
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function promptMessage(node: SimNode, vars: Record<string, string>): SimMessage {
  const c = node.config;
  if (node.node_type === "send_buttons") {
    const buttons = Array.isArray(c.buttons) ? (c.buttons as SimButton[]) : [];
    return {
      from: "bot",
      kind: "buttons",
      text: interpolate(str(c.text), vars),
      header: str(c.header_text) || undefined,
      footer: str(c.footer_text) || undefined,
      buttons: buttons.map((b) => ({ reply_id: b.reply_id, title: b.title })),
    };
  }
  if (node.node_type === "send_list") {
    const sections = Array.isArray(c.sections) ? (c.sections as SimListSection[]) : [];
    return {
      from: "bot",
      kind: "list",
      text: interpolate(str(c.text), vars),
      header: str(c.header_text) || undefined,
      footer: str(c.footer_text) || undefined,
      button_label: str(c.button_label) || "Options",
      sections: sections.map((s) => ({
        title: s.title,
        rows: (s.rows ?? []).map((r) => ({
          reply_id: r.reply_id,
          title: r.title,
          description: r.description,
        })),
      })),
    };
  }
  // collect_input
  return { from: "bot", kind: "text", text: interpolate(str(c.prompt_text), vars) };
}

function evalCondition(node: SimNode, state: SimState): { result: boolean; note: string } {
  const c = node.config;
  const subject = str(c.subject);
  const key = str(c.subject_key);
  const op = str(c.operator);
  const expected = str(c.value);
  let value: string | undefined;
  let note = "";
  if (subject === "var") {
    value = state.vars[key];
  } else if (subject === "tag") {
    value = state.tags.includes(key) ? key : undefined;
  } else {
    note = ` (contact ${key || "field"} isn't known in preview — treated as empty)`;
  }
  let result: boolean;
  switch (op) {
    case "present":
      result = value !== undefined && value !== "";
      break;
    case "absent":
      result = value === undefined || value === "";
      break;
    case "equals":
      result = (value ?? "").toLowerCase() === expected.toLowerCase();
      break;
    case "contains":
      result = (value ?? "").toLowerCase().includes(expected.toLowerCase());
      break;
    default:
      result = false;
  }
  return { result, note };
}

/** Walk auto-advancing nodes from `key` until something suspends or ends. */
function advance(
  nodes: Map<string, SimNode>,
  state: SimState,
  key: string | null,
  tagNames: Record<string, string>,
): SimState {
  const messages = [...state.messages];
  const vars = { ...state.vars };
  const tags = [...state.tags];
  const visited = new Set<string>();
  const fail = (text: string): SimState => ({
    ...state,
    vars,
    tags,
    status: "error",
    current: null,
    messages: [...messages, { from: "system", text, tone: "error" }],
  });

  let currentKey = key;
  for (let safety = 0; safety < 64; safety += 1) {
    if (!currentKey) return fail("⚠️ A step has no next step selected — the flow stops here.");
    if (visited.has(currentKey)) {
      return fail(`⚠️ Loop detected at "${currentKey}" — the real bot would stop here instead of spamming.`);
    }
    visited.add(currentKey);
    const node = nodes.get(currentKey);
    if (!node) return fail(`⚠️ Step "${currentKey}" doesn't exist.`);
    const c = node.config;

    switch (node.node_type) {
      case "start":
        currentKey = str(c.next_node_key) || null;
        continue;
      case "send_message": {
        const label = str(c.link_label).trim();
        const url = str(c.link_url).trim();
        messages.push({
          from: "bot",
          kind: "text",
          text: interpolate(str(c.text), vars),
          ...(label && url ? { link: { label, url } } : {}),
        });
        currentKey = str(c.next_node_key) || null;
        continue;
      }
      case "send_media":
        messages.push({
          from: "bot",
          kind: "media",
          media_type: str(c.media_type) || "image",
          url: str(c.media_url),
          caption: str(c.caption) ? interpolate(str(c.caption), vars) : undefined,
        });
        currentKey = str(c.next_node_key) || null;
        continue;
      case "set_tag": {
        const id = str(c.tag_id);
        const name = tagNames[id] ?? "a tag";
        if (str(c.mode) === "remove") {
          const i = tags.indexOf(id);
          if (i >= 0) tags.splice(i, 1);
          messages.push({ from: "system", text: `🏷️ Tag removed: ${name}` });
        } else {
          if (!tags.includes(id)) tags.push(id);
          messages.push({ from: "system", text: `🏷️ Tag added: ${name}` });
        }
        currentKey = str(c.next_node_key) || null;
        continue;
      }
      case "condition": {
        const { result, note } = evalCondition(node, { ...state, vars, tags });
        messages.push({ from: "system", text: `🔀 Condition is ${result ? "TRUE" : "FALSE"}${note}` });
        currentKey = str(result ? c.true_next : c.false_next) || null;
        continue;
      }
      case "send_buttons":
      case "send_list":
      case "collect_input":
        messages.push(promptMessage(node, vars));
        return {
          status: node.node_type === "collect_input" ? "waiting_text" : "waiting_tap",
          current: node.node_key,
          vars,
          tags,
          messages,
          reprompts: 0,
        };
      case "handoff":
        messages.push({
          from: "system",
          text: `🙋 Chat handed to your team${str(c.note) ? ` — note: ${str(c.note)}` : ""}`,
        });
        return { status: "handed_off", current: null, vars, tags, messages, reprompts: 0 };
      case "end":
        messages.push({ from: "system", text: "✅ Flow finished" });
        return { status: "ended", current: null, vars, tags, messages, reprompts: 0 };
      default:
        return fail(`⚠️ Unknown step type "${node.node_type}".`);
    }
  }
  return fail("⚠️ Too many steps without waiting for the customer.");
}

export function startSimulation(
  nodes: SimNode[],
  entryKey: string | null,
  tagNames: Record<string, string> = {},
): SimState {
  const empty: SimState = {
    status: "waiting_tap",
    current: null,
    vars: {},
    tags: [],
    messages: [],
    reprompts: 0,
  };
  return advance(new Map(nodes.map((n) => [n.node_key, n])), empty, entryKey, tagNames);
}

/** Customer taps a button or list row on the current prompt. */
export function tapReply(
  nodes: SimNode[],
  state: SimState,
  replyId: string,
  tagNames: Record<string, string> = {},
): SimState {
  if (state.status !== "waiting_tap" || !state.current) return state;
  const map = new Map(nodes.map((n) => [n.node_key, n]));
  const node = map.get(state.current);
  if (!node) return state;
  const options: Array<SimButton & { next_node_key?: string }> =
    node.node_type === "send_buttons"
      ? ((node.config.buttons as Array<SimButton & { next_node_key?: string }>) ?? [])
      : (((node.config.sections as Array<{ rows?: Array<SimButton & { next_node_key?: string }> }>) ?? [])
          .flatMap((s) => s.rows ?? []));
  const picked = options.find((o) => o.reply_id === replyId);
  if (!picked) return state;
  const withTap: SimState = {
    ...state,
    messages: [...state.messages, { from: "user", text: picked.title }],
  };
  return advance(map, withTap, picked.next_node_key ?? null, tagNames);
}

/**
 * Customer types text. On a collect_input step it's captured into vars;
 * anywhere else it triggers the reprompt fallback like the real runner.
 */
export function typeText(
  nodes: SimNode[],
  state: SimState,
  text: string,
  tagNames: Record<string, string> = {},
): SimState {
  const trimmed = text.trim();
  if (!trimmed || !state.current) return state;
  const map = new Map(nodes.map((n) => [n.node_key, n]));
  const node = map.get(state.current);
  if (!node) return state;
  const withMsg: SimState = {
    ...state,
    messages: [...state.messages, { from: "user", text: trimmed }],
  };

  if (state.status === "waiting_text" && node.node_type === "collect_input") {
    const varKey = str(node.config.var_key);
    const next: SimState = {
      ...withMsg,
      vars: varKey ? { ...withMsg.vars, [varKey]: trimmed } : withMsg.vars,
      messages: varKey
        ? [...withMsg.messages, { from: "system", text: `💾 Saved as {{vars.${varKey}}}` }]
        : withMsg.messages,
    };
    return advance(map, next, str(node.config.next_node_key) || null, tagNames);
  }

  // Typed instead of tapping: the runner re-sends the prompt, then
  // hands off after MAX_REPROMPTS (default fallback policy).
  const reprompts = state.reprompts + 1;
  if (reprompts > MAX_REPROMPTS) {
    return {
      ...withMsg,
      status: "handed_off",
      current: null,
      messages: [
        ...withMsg.messages,
        { from: "system", text: "🙋 Customer didn't pick an option — chat handed to your team", tone: "warn" },
      ],
    };
  }
  return {
    ...withMsg,
    reprompts,
    messages: [
      ...withMsg.messages,
      { from: "system", text: "↩️ Not an option — the bot sends the choices again", tone: "warn" },
      promptMessage(node, withMsg.vars),
    ],
  };
}
