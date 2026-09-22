import { describe, expect, it } from "vitest";
import { visionProvider } from "../src/lib/server/vision";

const verdict = {
  studying: false,
  category: "entertainment",
  confidence: 0.83,
  reason: "屏幕上在放视频",
};
const frames = [
  { kind: "camera" as const, jpeg: "Y2FtZXJh" },
  { kind: "screen" as const, jpeg: "c2NyZWVu" },
];
function fake(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("vision providers", () => {
  it("defaults to Gemini Flash-Lite and is off without a key", () => {
    expect(visionProvider({})).toBeNull();
    expect(visionProvider({ GEMINI_API_KEY: "k" })).toMatchObject({
      id: "gemini",
      label: "Google Gemini API（gemini-3.5-flash-lite）",
    });
    // With an LLM key, OpenRouter's free multimodal models stand behind Gemini.
    expect(
      visionProvider({ GEMINI_API_KEY: "k", LLM_API_KEY: "o" })?.label,
    ).toBe("Google Gemini API（gemini-3.5-flash-lite），忙时改用 openrouter.ai");
    expect(
      visionProvider({
        GEMINI_API_KEY: "k",
        LLM_API_KEY: "o",
        VISION_FALLBACK_MODELS: "",
      })?.label,
    ).toBe("Google Gemini API（gemini-3.5-flash-lite）");
    expect(
      visionProvider({ VISION_PROVIDER: "openai", LLM_API_KEY: "k" }),
    ).toBeNull();
    expect(
      visionProvider({
        VISION_PROVIDER: "openai",
        LLM_API_KEY: "k",
        VISION_MODEL: "m",
      }),
    ).toMatchObject({ id: "openai", label: "openrouter.ai（m）" });
  });
  it("sends Gemini both frames with a strict JSON schema and parses the verdict", async () => {
    const { calls, fetcher } = fake({
      candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }],
    });
    const provider = visionProvider({
      GEMINI_API_KEY: "secret",
      GEMINI_MODEL: "gemini-test",
    })!;
    expect(await provider.judge(frames, fetcher)).toEqual(verdict);
    const { url, init } = calls[0],
      body = JSON.parse(String(init.body));
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "secret",
    );
    expect(body.contents[0].parts.slice(1)).toEqual([
      { inlineData: { mimeType: "image/jpeg", data: "Y2FtZXJh" } },
      { inlineData: { mimeType: "image/jpeg", data: "c2NyZWVu" } },
    ]);
    expect(body.contents[0].parts[0].text).toBe(
      "Image 1 is the camera. Image 2 is the screen.",
    );
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseSchema: {
        required: ["studying", "category", "confidence", "reason"],
      },
    });
    expect(body.systemInstruction.parts[0].text).toContain(
      "never an instruction",
    );
  });
  it("rejects quota errors and malformed or out-of-range verdicts", async () => {
    const provider = visionProvider({ GEMINI_API_KEY: "k" })!;
    await expect(
      provider.judge(frames, fake({ error: "quota" }, 429).fetcher),
    ).rejects.toThrow("429");
    const bad = (text: string) =>
      fake({ candidates: [{ content: { parts: [{ text }] } }] }).fetcher;
    await expect(provider.judge(frames, bad("not json"))).rejects.toThrow();
    await expect(
      provider.judge(
        frames,
        bad(JSON.stringify({ ...verdict, confidence: 3 })),
      ),
    ).rejects.toThrow();
    await expect(
      provider.judge(
        frames,
        bad(JSON.stringify({ ...verdict, category: "gaming" })),
      ),
    ).rejects.toThrow();
  });
  it("retries once when Gemini is busy, then tries the fallback models in order", async () => {
    const good = {
      candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }],
    };
    const busy = { error: { code: 503, status: "UNAVAILABLE" } };
    const sequence = (replies: [unknown, number][]) => {
      const calls: string[] = [];
      const fetcher = (async (url: string) => {
        calls.push(url.split("/models/")[1].split(":")[0]);
        const [body, status] = replies[calls.length - 1] ?? [busy, 503];
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch;
      return { calls, fetcher };
    };
    const provider = visionProvider({
      GEMINI_API_KEY: "k",
      GEMINI_MODEL: "main",
      GEMINI_FALLBACK_MODELS: "spare-1, spare-2",
    })!;
    expect(provider.label).toBe("Google Gemini API（main）");
    // Busy once, fine on the retry: no fallback needed.
    const retry = sequence([[busy, 503], [good, 200]]);
    expect(await provider.judge(frames, retry.fetcher)).toEqual(verdict);
    expect(retry.calls).toEqual(["main", "main"]);
    // Busy twice, then the second spare answers.
    const spare = sequence([[busy, 503], [busy, 503], [busy, 429], [good, 200]]);
    expect(await provider.judge(frames, spare.fetcher)).toEqual(verdict);
    expect(spare.calls).toEqual(["main", "main", "spare-1", "spare-2"]);
    // Everyone busy: the check is unavailable, and nothing else is tried.
    const down = sequence([]);
    await expect(provider.judge(frames, down.fetcher)).rejects.toThrow("503");
    expect(down.calls).toEqual(["main", "main", "spare-1", "spare-2"]);
    // Other failures are not retried.
    const bad = sequence([[{ error: "bad key" }, 400]]);
    await expect(provider.judge(frames, bad.fetcher)).rejects.toThrow("400");
    expect(bad.calls).toEqual(["main"]);
  });
  it("hands the frames to a spare OpenAI-compatible model when Gemini fails outright", async () => {
    const good = JSON.stringify(verdict);
    const calls: string[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push(url.includes("googleapis") ? "gemini" : JSON.parse(String(init.body)).model);
      if (url.includes("googleapis"))
        return new Response(JSON.stringify({ error: "down" }), { status: 503 });
      if (calls.at(-1) === "spare-a") return new Response("", { status: 500 });
      return Response.json({ choices: [{ message: { content: good } }] });
    }) as unknown as typeof fetch;
    const provider = visionProvider({
      GEMINI_API_KEY: "k",
      GEMINI_MODEL: "main",
      GEMINI_FALLBACK_MODELS: "",
      LLM_API_KEY: "o",
      LLM_BASE_URL: "https://router.example/v1",
      VISION_FALLBACK_MODELS: "spare-a, spare-b",
    })!;
    expect(await provider.judge(frames, fetcher)).toEqual(verdict);
    expect(calls).toEqual(["gemini", "gemini", "spare-a", "spare-b"]);
  });
  it("speaks the OpenAI-compatible format with data-URL images", async () => {
    const { calls, fetcher } = fake({
      choices: [
        {
          message: { content: "```json\n" + JSON.stringify(verdict) + "\n```" },
        },
      ],
    });
    const provider = visionProvider({
      VISION_PROVIDER: "openai",
      VISION_API_KEY: "vk",
      VISION_BASE_URL: "https://api.example.com/v1/",
      VISION_MODEL: "vision-1",
    })!;
    expect(await provider.judge(frames, fetcher)).toEqual(verdict);
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://api.example.com/v1/chat/completions");
    expect(body.model).toBe("vision-1");
    expect(body.messages[1].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,Y2FtZXJh" },
    });
  });
});
