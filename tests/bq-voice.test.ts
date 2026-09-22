import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../src/lib/types";

// The real route with a fake Storage bucket and an in-memory game state.
const env = vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://db.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    REFEREE_KEY: "referee-secret",
    APP_URL: "http://app.test",
  });
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const client = {
    storage: {
      getBucket: async () => ({ error: null }),
      createBucket: async () => ({ error: null }),
      from: () => ({
        upload: async (
          path: string,
          bytes: Uint8Array,
          options: { contentType: string },
        ) => {
          files.set(path, { bytes, type: options.contentType });
          return { error: null };
        },
        download: async (path: string) => ({
          data: files.has(path)
            ? new Blob([new Uint8Array(files.get(path)!.bytes)], {
                type: files.get(path)!.type,
              })
            : null,
        }),
      }),
    },
  };
  return { files, client, jar: new Map<string, string>(), state: undefined as unknown };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      env.jar.has(name) ? { name, value: env.jar.get(name)! } : undefined,
    set: (name: string, value: string) => void env.jar.set(name, value),
    delete: (name: string) => void env.jar.delete(name),
  }),
}));
vi.mock("@/lib/server/supabase", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  adminClient: () => env.client,
}));
vi.mock("@/lib/server/repository", async (importOriginal) => {
  const real = await importOriginal<object>();
  const { advance, newGame } = await import("@/lib/engine");
  const { bank } = await import("@/lib/server/bank");
  return {
    ...real,
    transact: async (
      change: (s: GameState) => void = () => {},
      now = new Date().toISOString(),
    ) => {
      const state = structuredClone(
        (env.state as GameState) ?? newGame(now, bank),
      );
      advance(state, now, bank);
      change(state);
      env.state = state;
      return state;
    },
  };
});
vi.mock("@/lib/server/study", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadOutcomes: async () => [],
}));

const auth = await import("../src/app/api/auth/route");
const voice = await import("../src/app/api/bq/voice/route");
const COOKIE = "offer-quest-session";
const START = "2026-09-22T14:00:00Z";
// EBML header, as every WebM file starts; the rest is padding.
const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(600, 1),
]).toString("base64");
const M4A = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from("ftypM4A "),
  Buffer.alloc(600, 2),
]).toString("base64");
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(600, 3),
]).toString("base64");

async function enter(body: object) {
  env.jar.clear();
  await auth.POST(
    new Request("http://app.test/api/auth", {
      method: "POST",
      headers: { origin: "http://app.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return env.jar.get(COOKIE)!;
}
const as = (token: string) => {
  env.jar.clear();
  env.jar.set(COOKIE, token);
};
async function upload(body: object) {
  const res = await voice.POST(
    new Request("http://app.test/api/bq/voice", {
      method: "POST",
      headers: { origin: "http://app.test", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}
const fetchVoice = (date: string) =>
  voice.GET(new Request(`http://app.test/api/bq/voice?date=${date}`));
const today = () => Object.keys((env.state as GameState).days).sort().at(-1)!;
let player = "",
  referee = "";
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse(START));
  env.files.clear();
  env.state = undefined;
  player = await enter({ name: "Shan" });
  referee = await enter({ name: "裁判", key: "referee-secret" });
});
afterAll(() => vi.useRealTimers());

describe("BQ voice recordings", () => {
  it("stores her recording, completes the practice stage, and plays it back to both of them", async () => {
    as(player);
    const date = today();
    const draft = await upload({ date, mime: "audio/webm", seconds: 42, audio: WEBM });
    expect(draft.status).toBe(200);
    // At the draft stage the recording is attached but the written draft is still the task.
    expect(draft.body.state.days[date].bq).toMatchObject({
      stage: 1,
      practiced: false,
      voice: { seconds: 42, mime: "audio/webm" },
    });
    expect(draft.body.state.audit.at(-1)).toMatchObject({
      action: "bqVoice",
      detail: "录了 BQ 口述，42 秒",
    });
    (env.state as GameState).days[date].bq!.stage = 2;
    const told = await upload({ date, mime: "audio/mp4", seconds: 60, audio: M4A });
    expect(told.status).toBe(200);
    expect(told.body.state.days[date].bq).toMatchObject({
      stage: 2,
      practiced: true,
      voice: { seconds: 60, mime: "audio/mp4" },
    });
    expect(told.body.state.days[date].bq.completedAt).toBeTruthy();
    const mine = await fetchVoice(date);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("audio/mp4");
    as(referee);
    expect((await fetchVoice(date)).status).toBe(200);
    env.jar.clear();
    expect((await fetchVoice(date)).status).toBe(401);
  });
  it("rejects the referee, other days, and files that are not the audio they claim", async () => {
    as(player);
    const date = today();
    expect(
      (await upload({ date, mime: "audio/webm", seconds: 10, audio: PNG })).status,
    ).toBe(400);
    expect(
      (
        await upload({
          date: "2026-09-21",
          mime: "audio/webm",
          seconds: 10,
          audio: WEBM,
        })
      ).status,
    ).toBe(409);
    expect((await fetchVoice(date)).status).toBe(404);
    as(referee);
    expect(
      (await upload({ date, mime: "audio/webm", seconds: 10, audio: WEBM })).status,
    ).toBe(403);
  });
});
