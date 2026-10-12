/**
 * "Create template with AI" — turns a message the customer pastes into
 * a complete WhatsApp template (name, category, language, header, body
 * with {{n}} variables + samples, footer, buttons), or asks short
 * questions when something essential is missing.
 *
 * Every draft is checked with the same validator the submit pipeline
 * uses (plus Meta review rules the validator doesn't cover); a failing
 * draft gets one repair attempt with the errors fed back.
 */

import type { TemplateButton } from "@/types";
import { validateTemplatePayload, type TemplatePayload } from "@/lib/whatsapp/template-validators";
import { AI_NOT_CONFIGURED, aiApiKey, aiChat, aiModel, parseJsonObject, type ChatMessage } from "./gemini";

export const MAX_MESSAGE_LEN = 3000;
export const MAX_QUESTIONS = 4;

export interface DraftAnswer {
  question: string;
  answer: string;
}

export type TemplateDraftResult =
  | { ok: true; status: "needs_info"; questions: string[] }
  | { ok: true; status: "ready"; draft: TemplatePayload; summary: string }
  | { ok: false; error: string };

export function buildTemplateDraftPrompt(existingNames: string[]): string {
  return [
    "You turn a business's WhatsApp message into a Meta-approvable WhatsApp message template.",
    "Reply with ONE JSON object and nothing else. Two possible shapes:",
    "",
    '1) If something essential is missing, ask: {"status":"needs_info","questions":["…"]}',
    `   At most ${MAX_QUESTIONS} short, plain-language questions. Only ask for what you truly cannot infer`,
    "   (e.g. the website link for a button the message clearly wants, or an image link for an image header).",
    "   Never ask about name, category, language, variables or samples — decide those yourself.",
    "",
    '2) Otherwise: {"status":"ready","summary":"one sentence on what you set up","template":{',
    '     "name": "lowercase_with_underscores, max 60 chars, descriptive, unique",',
    '     "category": "MARKETING" or "UTILITY",',
    '     "language": "Meta language code matching the message, e.g. en, en_US, hi, es",',
    '     "header": null | {"type":"text","text":"…"} | {"type":"image"|"video"|"document","url":"https://…"},',
    '     "body": "…", "body_samples": ["…"],',
    '     "header_sample": "…" (only if the text header has {{1}}),',
    '     "footer": null | "…",',
    '     "buttons": [ {"type":"QUICK_REPLY","text":"…"} | {"type":"URL","text":"…","url":"https://…"}',
    '                 | {"type":"PHONE_NUMBER","text":"…","phone_number":"+…"} | {"type":"COPY_CODE","text":"Copy code","example":"…"} ]',
    "   }}",
    "",
    "Rules (Meta rejects templates that break them):",
    "- Keep the customer's meaning, tone and language; fix spelling and make it clear and friendly.",
    "- Replace details that change per recipient (customer name, order number, date, amount, code, link part)",
    "  with {{1}}, {{2}}, … numbered in order of appearance, and give one realistic sample per variable in body_samples.",
    "- The body must not start or end with a variable, must not have two variables side by side,",
    "  and must have clearly more words than variables. Body max 1024 characters.",
    "- UTILITY only for updates about an existing order, booking, account or payment. Offers, discounts,",
    "  greetings, announcements or anything promotional are MARKETING. Never AUTHENTICATION.",
    "- Header text max 60 characters with at most one variable, {{1}}. Footer max 60 characters, no variables.",
    "- Only use an image/video/document header if the user gave a public https link to the file.",
    "- Buttons: up to 3 QUICK_REPLY, or call-to-action buttons (max 2 URL, 1 PHONE_NUMBER, 1 COPY_CODE).",
    "  Button text max 25 characters. Quick replies must come before other buttons. Use a URL button when the",
    "  message has a link, a PHONE_NUMBER button when it asks people to call, COPY_CODE for a coupon code.",
    "- Don't put links or phone numbers in the body when they're already a button.",
    "- No emojis-only lines, no ALL CAPS shouting, no misleading claims.",
    existingNames.length
      ? `- These template names are taken, choose a different one: ${existingNames.slice(0, 200).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Variable rules Meta reviews for but our validator doesn't check. */
export function reviewRuleIssues(body: string): string[] {
  const issues: string[] = [];
  const trimmed = body.trim();
  if (/^\{\{\d+\}\}/.test(trimmed)) issues.push("The body must not start with a variable.");
  if (/\{\{\d+\}\}[.!?…]*$/.test(trimmed)) issues.push("The body must not end with a variable.");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(trimmed)) issues.push("Two variables must not be side by side.");
  const vars = (trimmed.match(/\{\{\d+\}\}/g) ?? []).length;
  const words = trimmed.replace(/\{\{\d+\}\}/g, " ").split(/\s+/).filter(Boolean).length;
  if (vars > 0 && words < vars * 3) issues.push("The body needs more words around its variables.");
  return issues;
}

function toButtons(raw: unknown): TemplateButton[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: TemplateButton[] = [];
  for (const b of raw) {
    const o = (b ?? {}) as Record<string, unknown>;
    const type = str(o.type).toUpperCase();
    const text = str(o.text);
    if (type === "QUICK_REPLY") out.push({ type, text });
    else if (type === "URL") out.push({ type, text, url: str(o.url), ...(str(o.example) ? { example: str(o.example) } : {}) });
    else if (type === "PHONE_NUMBER") out.push({ type, text, phone_number: str(o.phone_number) });
    else if (type === "COPY_CODE") out.push({ type, text, example: str(o.example) });
  }
  return out.length ? out : undefined;
}

/** Turn the model's "ready" template object into a submit payload. */
export function toTemplatePayload(t: Record<string, unknown>): TemplatePayload {
  const category = str(t.category).toUpperCase() === "UTILITY" ? "Utility" : "Marketing";
  const payload: TemplatePayload = {
    name: str(t.name).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60),
    category,
    language: str(t.language) || "en",
    body_text: str(t.body),
  };
  const header = (t.header ?? null) as Record<string, unknown> | null;
  const headerType = str(header?.type).toLowerCase();
  if (headerType === "text" && str(header?.text)) {
    payload.header_type = "text";
    payload.header_content = str(header?.text);
  } else if (["image", "video", "document"].includes(headerType) && str(header?.url)) {
    payload.header_type = headerType as TemplatePayload["header_type"];
    payload.header_media_url = str(header?.url);
  }
  const footer = str(t.footer);
  if (footer) payload.footer_text = footer;
  const buttons = toButtons(t.buttons);
  if (buttons) payload.buttons = buttons;

  const bodySamples = Array.isArray(t.body_samples) ? t.body_samples.map((s) => String(s ?? "").trim()) : [];
  const headerSample = str(t.header_sample);
  if (bodySamples.length || headerSample) {
    payload.sample_values = {
      ...(bodySamples.length ? { body: bodySamples } : {}),
      ...(headerSample && payload.header_type === "text" ? { header: [headerSample] } : {}),
    };
  }
  return payload;
}

/** All problems with a draft, from the shared validator and review rules. */
export function draftIssues(payload: TemplatePayload, takenNames: string[]): string[] {
  const issues: string[] = [];
  try {
    validateTemplatePayload(payload);
  } catch (e) {
    issues.push(e instanceof Error ? e.message : String(e));
  }
  issues.push(...reviewRuleIssues(payload.body_text));
  if (takenNames.includes(payload.name)) issues.push(`The name "${payload.name}" is already taken.`);
  return issues;
}

export async function draftTemplateWithAi(
  input: { message: string; answers?: DraftAnswer[]; existingNames?: string[] },
  opts: { apiKey?: string; model?: string; chat?: typeof aiChat } = {}
): Promise<TemplateDraftResult> {
  const apiKey = opts.apiKey ?? aiApiKey();
  if (!apiKey) return { ok: false, error: AI_NOT_CONFIGURED };
  const message = input.message.trim();
  if (!message) return { ok: false, error: "Paste the message you want to send." };
  if (message.length > MAX_MESSAGE_LEN) {
    return { ok: false, error: `The message is too long (max ${MAX_MESSAGE_LEN} characters).` };
  }
  const chat = opts.chat ?? aiChat;
  const taken = input.existingNames ?? [];
  const answers = (input.answers ?? []).filter((a) => a.answer.trim());

  const messages: ChatMessage[] = [
    { role: "system", content: buildTemplateDraftPrompt(taken) },
    {
      role: "user",
      content:
        `Message to turn into a template:\n"""\n${message}\n"""` +
        (answers.length
          ? `\n\nAnswers to your questions:\n${answers.map((a) => `- ${a.question}\n  ${a.answer.trim()}`).join("\n")}` +
            "\n\nDon't ask again about anything answered here."
          : ""),
    },
  ];

  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let raw: string;
    try {
      raw = await chat({ apiKey, model: aiModel(opts.model), messages, temperature: 0.3, maxTokens: 2500 });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const obj = parseJsonObject(raw);
    if (obj && obj.status === "needs_info") {
      const questions = (Array.isArray(obj.questions) ? obj.questions : [])
        .map((q) => str(q))
        .filter(Boolean)
        .slice(0, MAX_QUESTIONS);
      // After the user has answered once, don't loop on more questions.
      if (questions.length && answers.length === 0) return { ok: true, status: "needs_info", questions };
      lastIssues = ["Do not ask more questions; produce the template now with sensible choices."];
    } else if (obj && obj.status === "ready" && obj.template && typeof obj.template === "object") {
      const draft = toTemplatePayload(obj.template as Record<string, unknown>);
      lastIssues = draftIssues(draft, taken);
      if (lastIssues.length === 0) {
        return { ok: true, status: "ready", draft, summary: str(obj.summary) };
      }
    } else {
      lastIssues = ["Reply with a single JSON object in one of the two shapes."];
    }
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: `Fix these problems and reply with the corrected JSON only:\n- ${lastIssues.join("\n- ")}` }
    );
  }
  return {
    ok: false,
    error: `The AI couldn't produce a valid template (${lastIssues.join(" ")}). Try rewording the message, or use New Template.`,
  };
}
