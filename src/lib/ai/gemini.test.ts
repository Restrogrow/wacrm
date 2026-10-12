import { afterEach, describe, expect, it, vi } from "vitest";

import { aiApiKey, aiChat, AiRateLimitError, aiModel, DEFAULT_GEMINI_MODEL, toGeminiRequest } from "./gemini";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("config", () => {
  it("reads GEMINI_KEY (or GEMINI_API_KEY) and defaults the model", () => {
    vi.stubEnv("GEMINI_KEY", "k1");
    expect(aiApiKey()).toBe("k1");
    vi.stubEnv("GEMINI_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "k2");
    expect(aiApiKey()).toBe("k2");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(aiModel()).toBe(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
    expect(aiModel("gemini-x")).toBe("gemini-x");
  });
});

describe("toGeminiRequest", () => {
  it("moves system to systemInstruction, maps roles, merges runs, starts with user", () => {
    const req = toGeminiRequest([
      { role: "system", content: "Be brief." },
      { role: "assistant", content: "Hi! How can I help?" },
      { role: "user", content: "Price?" },
      { role: "user", content: "And timings?" },
    ]);
    expect(req.systemInstruction).toEqual({ parts: [{ text: "Be brief." }] });
    expect(req.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(req.contents[2].parts[0].text).toBe("Price?\n\nAnd timings?");
  });
});

describe("aiChat", () => {
  const base = { apiKey: "secret-key", model: "gemini-2.5-flash" };

  it("calls generateContent with the key header and returns the text", async () => {
    const fetchFn = mockFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"reply":"Hello"}' }] }, finishReason: "STOP" }],
    });
    const out = await aiChat({ ...base, messages: [{ role: "user", content: "hi" }], maxTokens: 100 });
    expect(out).toBe('{"reply":"Hello"}');

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    );
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(url).not.toContain("secret-key"); // key never in the URL
    const body = JSON.parse(init.body as string);
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
    expect(body.generationConfig.maxOutputTokens).toBe(612);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 512 });
  });

  it("skips thought parts", async () => {
    mockFetch(200, {
      candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: "Answer" }] } }],
    });
    await expect(aiChat({ ...base, messages: [{ role: "user", content: "q" }] })).resolves.toBe("Answer");
  });

  it("maps 429 to AiRateLimitError and other errors to a clear message", async () => {
    mockFetch(429, { error: { message: "Quota exceeded" } });
    await expect(aiChat({ ...base, messages: [{ role: "user", content: "q" }] })).rejects.toBeInstanceOf(
      AiRateLimitError
    );
    mockFetch(400, { error: { message: "API key not valid" } });
    await expect(aiChat({ ...base, messages: [{ role: "user", content: "q" }] })).rejects.toThrow(
      "AI request failed (400): API key not valid"
    );
  });

  it("reports blocked and empty responses", async () => {
    mockFetch(200, { promptFeedback: { blockReason: "SAFETY" } });
    await expect(aiChat({ ...base, messages: [{ role: "user", content: "q" }] })).rejects.toThrow(/SAFETY/);
    mockFetch(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] });
    await expect(aiChat({ ...base, messages: [{ role: "user", content: "q" }] })).rejects.toThrow(/MAX_TOKENS/);
  });
});

describe("aiChat JSON mode and retries", () => {
  const base = { apiKey: "secret-key", model: "gemini-2.5-flash", messages: [{ role: "user" as const, content: "q" }] };
  const ok = { candidates: [{ content: { parts: [{ text: '{"reply":"hi","handoff":false}' }] } }] };

  it("sends the response schema in JSON mode", async () => {
    const fetchFn = mockFetch(200, ok);
    await aiChat({ ...base, responseSchema: { type: "OBJECT" } });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual({ type: "OBJECT" });
  });

  it("retries a 5xx once, but never a 4xx", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    await expect(aiChat({ ...base, retries: 1 })).resolves.toContain("hi");
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const bad = mockFetch(400, { error: { message: "bad key" } });
    await expect(aiChat({ ...base, retries: 1 })).rejects.toThrow("bad key");
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
