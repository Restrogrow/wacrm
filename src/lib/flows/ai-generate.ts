/**
 * Generate a flow (trigger + nodes) from a plain-language description
 * using Groq's OpenAI-compatible chat API.
 *
 * The model is asked for a single JSON object matching the shapes in
 * `./types`. Its output is normalised, then run through the same
 * `validateFlowForActivation` the builder uses; any errors are fed back
 * to the model for one repair attempt. The caller saves the result as a
 * DRAFT, so a human always reviews it before it goes live.
 *
 * Env:
 *   API_GROQ     — required (GROQ_API_KEY also accepted).
 *   GROQ_MODEL   — optional, defaults to DEFAULT_MODEL.
 */

import { INTERACTIVE_LIMITS } from "@/lib/whatsapp/meta-api";
import { validateFlowForActivation, type ValidationIssue } from "./validate";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
/** One initial attempt + one repair attempt. Kept low for free-tier TPM. */
const MAX_ATTEMPTS = 2;

/** Node types the generator may emit. send_media needs an uploaded file,
 *  so it's left to the builder. */
const ALLOWED_NODE_TYPES = new Set([
  "start",
  "send_message",
  "send_buttons",
  "send_list",
  "collect_input",
  "condition",
  "set_tag",
  "handoff",
  "end",
]);

export interface AiTag {
  id: string;
  name: string;
}

export interface GeneratedFlow {
  flow: {
    name: string;
    description: string | null;
    trigger_type: "keyword" | "first_inbound_message" | "manual";
    trigger_config: Record<string, unknown>;
    entry_node_id: string;
  };
  nodes: Array<{
    node_key: string;
    node_type: string;
    config: Record<string, unknown>;
  }>;
}

export type GenerateResult =
  | { ok: true; generated: GeneratedFlow; warnings: ValidationIssue[] }
  | { ok: false; error: string; issues?: ValidationIssue[] };

export function buildSystemPrompt(tags: AiTag[]): string {
  const L = INTERACTIVE_LIMITS;
  const tagList =
    tags.length > 0
      ? tags.map((t) => `  - "${t.name}" → tag_id "${t.id}"`).join("\n")
      : "  (none — do NOT use set_tag nodes)";

  return `You design WhatsApp chatbot flows for a CRM. Reply with ONE JSON object only — no markdown, no commentary.

## Output shape
{
  "name": string,                       // short human-readable name, e.g. "Salon booking" (not snake_case)
  "description": string,                // one sentence
  "trigger_type": "keyword" | "first_inbound_message" | "manual",
  "trigger_config": { "keywords": string[], "match_type": "exact" | "contains" },  // keyword triggers only; use {} otherwise
  "entry_node_id": "start",
  "nodes": [ { "node_key": string, "node_type": string, "config": object } ]
}

## Node types (config shapes)
- start:          { "next_node_key": string }      // exactly one, node_key "start"
- send_message:   { "text": string, "next_node_key": string }   // sends text, auto-advances
- send_buttons:   { "text": string, "header_text"?: string, "footer_text"?: string,
                    "buttons": [ { "reply_id": string, "title": string, "next_node_key": string } ] }   // waits for a tap
- send_list:      { "text": string, "button_label": string, "header_text"?: string, "footer_text"?: string,
                    "sections": [ { "title": string, "rows": [ { "reply_id": string, "title": string, "description"?: string, "next_node_key": string } ] } ] }   // waits for a tap
- collect_input:  { "prompt_text": string, "var_key": string, "validation": "any", "next_node_key": string }   // asks a question, stores the typed reply
- condition:      { "subject": "var", "subject_key": string, "operator": "equals" | "contains" | "present" | "absent", "value"?: string, "true_next": string, "false_next": string }
- set_tag:        { "mode": "add", "tag_id": string, "next_node_key": string }   // tag the contact in the CRM
- handoff:        { "note": string }   // ends the bot, hands the chat to a human agent
- end:            {}                   // ends the bot

## Hard rules (the flow is rejected if broken)
- node_key: lowercase letters, digits, underscores; unique.
- Every next_node_key / true_next / false_next must be an existing node_key.
- Every branch must finish at an "end" or "handoff" node.
- NEVER make a loop of only start/send_message/condition/set_tag nodes — it would spam the customer. Loops are only OK if they pass through send_buttons, send_list or collect_input.
- send_buttons: 1–${L.maxButtons} buttons. Button title ≤ ${L.buttonTitleMaxLength} characters (emoji count as 2). reply_id unique within the node.
- If there are more than ${L.maxButtons} choices, use send_list instead.
- send_list: 1–${L.maxListRowsTotal} rows in total across all sections; row title ≤ ${L.listRowTitleMaxLength} chars; row description ≤ ${L.listRowDescriptionMaxLength} chars; button_label ≤ ${L.buttonTitleMaxLength} chars; section title ≤ ${L.listRowTitleMaxLength} chars.
- header_text / footer_text ≤ ${L.headerTextMaxLength} chars. Message text ≤ ${L.bodyMaxLength} chars.
- var_key: letters, digits, underscore; starts with a letter. Reuse captured values in later text as {{vars.var_key}}.
- WhatsApp has no link buttons here: put website URLs inside message text.
- Use WhatsApp formatting (*bold*) and a few emoji to keep it friendly. Write in the language the user writes the flow content in.
- Unless the user clearly asks otherwise, use trigger_type "keyword" with sensible keywords for the flow's purpose.
- For a greeting trigger use match_type "exact" with variants like hi, hii, hello, hey, namaste — "contains" with "hi" would also match words like "this".

## CRM tags available for set_tag
${tagList}
Only use tag_id values from this list. If the user asks to save/record a choice and a matching tag exists, add a set_tag node right after that choice.`;
}

/** Parse the outermost {...} in the reply, ignoring fences or stray prose. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Coerce the model's object into the shapes the validator and DB
 * expect. Returns extra issues for things the validator can't see
 * (unknown node types, tag ids that aren't this account's).
 */
export function normalizeGenerated(
  obj: Record<string, unknown>,
  tagIds: Set<string>,
): { generated: GeneratedFlow; extraIssues: ValidationIssue[] } {
  const extraIssues: ValidationIssue[] = [];
  const trigger_type =
    obj.trigger_type === "first_inbound_message" || obj.trigger_type === "manual"
      ? obj.trigger_type
      : "keyword";
  const trigger_config =
    trigger_type === "keyword" &&
    obj.trigger_config &&
    typeof obj.trigger_config === "object"
      ? (obj.trigger_config as Record<string, unknown>)
      : trigger_type === "keyword"
        ? { keywords: [] }
        : {};

  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: GeneratedFlow["nodes"] = [];
  for (const n of rawNodes) {
    if (!n || typeof n !== "object") continue;
    const node = n as Record<string, unknown>;
    const node_key = typeof node.node_key === "string" ? node.node_key.trim() : "";
    const node_type = typeof node.node_type === "string" ? node.node_type : "";
    const config =
      node.config && typeof node.config === "object" && !Array.isArray(node.config)
        ? (node.config as Record<string, unknown>)
        : {};
    if (!ALLOWED_NODE_TYPES.has(node_type)) {
      extraIssues.push({
        severity: "error",
        scope: "node",
        node_key,
        message: `Node type "${node_type}" is not allowed. Use one of: ${[...ALLOWED_NODE_TYPES].join(", ")}.`,
      });
    }
    if (node_type === "set_tag" && !tagIds.has(String(config.tag_id ?? ""))) {
      extraIssues.push({
        severity: "error",
        scope: "node",
        node_key,
        message: `set_tag uses unknown tag_id "${String(config.tag_id ?? "")}". Use only tag ids from the provided list, or remove this node.`,
      });
    }
    nodes.push({ node_key, node_type, config });
  }

  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim().slice(0, 120)
      : "AI flow";

  return {
    generated: {
      flow: {
        name,
        description:
          typeof obj.description === "string" ? obj.description.slice(0, 500) : null,
        trigger_type,
        trigger_config,
        entry_node_id:
          typeof obj.entry_node_id === "string" && obj.entry_node_id
            ? obj.entry_node_id
            : "start",
      },
      nodes,
    },
    extraIssues,
  };
}

async function callGroq(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_completion_tokens: 6000,
      // No response_format: Groq's json_object mode hard-fails the whole
      // request (400 json_validate_failed) on minor slips; we parse
      // leniently and repair via the validation loop instead.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch {
      // keep raw text
    }
    if (res.status === 429) {
      throw new Error(`AI rate limit reached — wait a minute and try again. (${msg})`);
    }
    throw new Error(`AI request failed (${res.status}): ${msg}`);
  }
  const content = JSON.parse(text)?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

export async function generateFlowFromPrompt(
  prompt: string,
  tags: AiTag[],
  opts: { apiKey?: string; model?: string } = {},
): Promise<GenerateResult> {
  const apiKey = opts.apiKey ?? process.env.API_GROQ ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AI is not configured (API_GROQ is missing)." };
  }
  const model = opts.model ?? process.env.GROQ_MODEL ?? DEFAULT_MODEL;
  const tagIds = new Set(tags.map((t) => t.id));

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(tags) },
    { role: "user", content: prompt },
  ];

  let lastIssues: ValidationIssue[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let content: string;
    try {
      content = await callGroq(apiKey, model, messages);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const obj = parseJsonObject(content);
    if (!obj) {
      lastIssues = [
        { severity: "error", scope: "flow", message: "Response was not a valid JSON object." },
      ];
    } else {
      const { generated, extraIssues } = normalizeGenerated(obj, tagIds);
      const issues = [
        ...extraIssues,
        ...validateFlowForActivation(generated.flow, generated.nodes),
      ];
      const errors = issues.filter((i) => i.severity === "error");
      if (errors.length === 0) {
        return { ok: true, generated, warnings: issues };
      }
      lastIssues = errors;
    }

    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content:
          "That flow has these problems. Fix ALL of them and reply with the full corrected JSON object:\n" +
          lastIssues
            .map((i) => `- ${i.node_key ? `[${i.node_key}${i.field ? `.${i.field}` : ""}] ` : ""}${i.message}`)
            .join("\n"),
      },
    );
  }

  return {
    ok: false,
    error: "The AI couldn't produce a valid flow. Try describing it a bit more simply.",
    issues: lastIssues,
  };
}
