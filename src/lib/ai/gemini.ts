/**
 * Minimal Google Gemini client (generateContent REST API), shared by
 * the flow generator and the AI chatbot.
 *
 * Env:
 *   GEMINI_KEY   — required (GEMINI_API_KEY also accepted).
 *   GEMINI_MODEL — optional model override (default DEFAULT_GEMINI_MODEL).
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// gemini-2.5-flash is no longer available to new API keys (Google's
// error message names gemini-3.8-flash as the replacement). Override
// with GEMINI_MODEL if Google retires this one too.
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiApiKey(): string | undefined {
  return process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || undefined;
}

export function aiModel(override?: string): string {
  return override || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/** Message shown wherever the key is missing. */
export const AI_NOT_CONFIGURED = "AI is not configured (GEMINI_KEY is missing).";

export class AiRateLimitError extends Error {}

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

/**
 * Map chat messages to Gemini's shape: system messages become the
 * system instruction, `assistant` becomes `model`, consecutive turns
 * from the same side are merged, and the conversation always opens with
 * a user turn (Gemini rejects a model-first history).
 */
export function toGeminiRequest(messages: ChatMessage[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
} {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n\n${m.content}`;
    else contents.push({ role, parts: [{ text: m.content }] });
  }
  if (contents[0]?.role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(conversation so far)" }] });
  }
  if (contents.length === 0) contents.push({ role: "user", parts: [{ text: "" }] });
  return {
    ...(system.length ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] } } : {}),
    contents,
  };
}

export class AiTransientError extends Error {}

export interface AiChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * Gemini response schema (OpenAPI subset, e.g. `{ type: "OBJECT", … }`).
   * Turns on JSON mode so the reply is always well-formed JSON. Only use
   * for small, fixed shapes — callers with complex output parse leniently.
   */
  responseSchema?: Record<string, unknown>;
  /** Extra attempts on rate limits, 5xx and network errors (default 0). */
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function aiChat(opts: AiChatOptions): Promise<string> {
  const attempts = 1 + Math.max(0, opts.retries ?? 0);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await aiChatOnce(opts);
    } catch (err) {
      const transient = err instanceof AiRateLimitError || err instanceof AiTransientError;
      if (!transient || attempt >= attempts) throw err;
      await sleep(err instanceof AiRateLimitError ? 2000 * attempt : 800 * attempt);
    }
  }
}

async function aiChatOnce(opts: AiChatOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 6000;
  // Gemini 2.5+ models "think" before answering and those tokens count
  // against maxOutputTokens. On 2.5 we cap thinking with a budget; newer
  // models manage their own thinking, so we only leave room for it on
  // top of the answer budget (otherwise a reply can come back empty with
  // finishReason MAX_TOKENS).
  const isGemini25 = opts.model.startsWith("gemini-2.5");
  const thinking = isGemini25 ? 512 : 0;
  const thinkingRoom = isGemini25 ? thinking : /^gemini-[3-9]/.test(opts.model) ? 2048 : 0;
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": opts.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...toGeminiRequest(opts.messages),
        generationConfig: {
          temperature: opts.temperature ?? 0.4,
          maxOutputTokens: maxTokens + thinkingRoom,
          ...(opts.responseSchema
            ? { responseMimeType: "application/json", responseSchema: opts.responseSchema }
            : {}),
          ...(thinking ? { thinkingConfig: { thinkingBudget: thinking } } : {}),
        },
      }),
    });
  } catch (err) {
    throw new AiTransientError(`AI request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch {
      // keep raw text
    }
    if (res.status === 429) {
      throw new AiRateLimitError(`AI rate limit reached — wait a minute and try again. (${msg})`);
    }
    if (res.status >= 500) throw new AiTransientError(`AI request failed (${res.status}): ${msg}`);
    throw new Error(`AI request failed (${res.status}): ${msg}`);
  }
  const data = JSON.parse(text);
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new Error(`AI declined to answer (${blocked}).`);
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const content = parts
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!content.trim()) {
    const reason = data?.candidates?.[0]?.finishReason;
    throw new Error(`AI returned an empty response${reason ? ` (${reason})` : ""}.`);
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
