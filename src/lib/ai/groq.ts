/**
 * Minimal Groq chat-completions client (OpenAI-compatible API), shared
 * by the flow generator and the AI chatbot.
 *
 * Env:
 *   API_GROQ   — required (GROQ_API_KEY also accepted).
 *   GROQ_MODEL — optional model override.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function groqApiKey(): string | undefined {
  return process.env.API_GROQ ?? process.env.GROQ_API_KEY;
}

export function groqModel(override?: string): string {
  return override ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
}

export class GroqRateLimitError extends Error {}

export async function groqChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_completion_tokens: opts.maxTokens ?? 6000,
      // No response_format: Groq's json_object mode hard-fails the whole
      // request (400 json_validate_failed) on minor slips; callers parse
      // leniently instead.
      ...(opts.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
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
      throw new GroqRateLimitError(`AI rate limit reached — wait a minute and try again. (${msg})`);
    }
    throw new Error(`AI request failed (${res.status}): ${msg}`);
  }
  const content = JSON.parse(text)?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response.");
  }
  return content;
}

/** Parse the outermost {...} in a reply, ignoring fences or stray prose. */
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
