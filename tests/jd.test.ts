import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../src/lib/types";

// The real action and jd routes with a fake Storage bucket and an in-memory game state.
const env = vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://db.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    REFEREE_KEY: "referee-secret",
    APP_URL: "http://app.test",
    LLM_API_KEY: "",
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
        remove: async (paths: string[]) => {
          paths.forEach((p) => files.delete(p));
          return { error: null };
        },
      }),
    },
  };
  return {
    files,
    client,
    jar: new Map<string, string>(),
    state: undefined as unknown,
  };
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
const action = await import("../src/app/api/action/route");
const jd = await import("../src/app/api/jd/route");
const COOKIE = "offer-quest-session";
const JD =
  "Data Scientist, Growth\n负责实验设计与指标体系。\nRequirements: SQL, Python, causal inference.";

async function enter(body: object) {
  env.jar.clear();
  await auth.POST(
    new Request("http://app.test/api/auth", {
      method: "POST",
      headers: {
        origin: "http://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  return env.jar.get(COOKIE)!;
}
const as = (token: string) => {
  env.jar.clear();
  env.jar.set(COOKIE, token);
};
async function post(body: object) {
  const res = await action.POST(
    new Request("http://app.test/api/action", {
      method: "POST",
      headers: {
        origin: "http://app.test",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}
const read = (logId: string) =>
  jd.GET(new Request(`http://app.test/api/jd?log=${logId}`));
const today = () =>
  Object.keys((env.state as GameState).days)
    .sort()
    .at(-1)!;
const logs = () => (env.state as GameState).days[today()].logs;

let player = "",
  referee = "";
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-09-23T15:00:00Z"));
  env.files.clear();
  env.state = undefined;
  player = await enter({ name: "Shan" });
  referee = await enter({ name: "裁判", key: "referee-secret" });
});
afterAll(() => vi.useRealTimers());

describe("job descriptions saved with an application", () => {
  it("keeps the text in storage, the size in the day, and shows it to both of them", async () => {
    as(player);
    const id = crypto.randomUUID();
    const saved = await post({
      type: "log",
      id,
      date: today(),
      kind: "application",
      count: 1,
      company: "Notion · Data Scientist",
      link: "https://example.com/job",
      jd: JD,
    });
    expect(saved.status).toBe(200);
    // The day carries only what the lists need; the description itself stays out of the state.
    expect(logs()[0]).toMatchObject({
      id,
      company: "Notion · Data Scientist",
      jd: { chars: JD.length },
    });
    expect(JSON.stringify(env.state)).not.toContain("causal inference");
    expect([...env.files.keys()]).toEqual([`jd/${id}.txt`]);
    expect(env.files.get(`jd/${id}.txt`)!.type).toBe("text/plain");
    const mine = await read(id);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toMatchObject({
      text: JD,
      company: "Notion · Data Scientist",
      link: "https://example.com/job",
    });
    as(referee);
    expect((await read(id)).status).toBe(200);
    env.jar.clear();
    expect((await read(id)).status).toBe(401);
  });
  it("deletes the description with the log, and answers 404 for anything else", async () => {
    as(player);
    const id = crypto.randomUUID();
    await post({
      type: "log",
      id,
      date: today(),
      kind: "application",
      count: 1,
      company: "",
      link: "",
      jd: JD,
    });
    // A log without a description, and an id that was never a log at all.
    const plain = crypto.randomUUID();
    await post({
      type: "log",
      id: plain,
      date: today(),
      kind: "contact",
      count: 1,
      company: "校友",
      link: "",
    });
    expect(logs().find((l) => l.id === plain)?.jd).toBeUndefined();
    expect((await read(plain)).status).toBe(404);
    expect((await read(crypto.randomUUID())).status).toBe(404);
    expect((await read("not-a-uuid")).status).toBe(404);

    await post({
      type: "removeLog",
      id: crypto.randomUUID(),
      date: today(),
      logId: id,
    });
    expect(logs().some((l) => l.id === id)).toBe(false);
    expect(env.files.has(`jd/${id}.txt`)).toBe(false);
    expect((await read(id)).status).toBe(404);
  });
  it("attaches a description to an older application, replaces it, and clears it", async () => {
    as(player);
    const id = crypto.randomUUID();
    await post({
      type: "log",
      id,
      date: today(),
      kind: "application",
      count: 1,
      company: "Healthfirst",
      link: "",
    });
    const yesterday = today();
    // The next day: the application is history, but its description can still be saved.
    vi.setSystemTime(Date.parse("2026-09-24T15:00:00Z"));
    const added = await post({
      type: "jd",
      id: crypto.randomUUID(),
      date: yesterday,
      logId: id,
      text: JD,
    });
    expect(added.status).toBe(200);
    expect(today()).not.toBe(yesterday);
    const stored = (env.state as GameState).days[yesterday].logs[0];
    expect(stored.jd).toMatchObject({ chars: JD.length });
    expect((await (await read(id)).json()).text).toBe(JD);
    expect((env.state as GameState).audit.at(-1)?.detail).toBe(
      "保存了一份职位描述",
    );

    const replaced = "新的 JD：Senior Data Scientist, Experimentation.";
    await post({
      type: "jd",
      id: crypto.randomUUID(),
      date: yesterday,
      logId: id,
      text: replaced,
    });
    expect((await (await read(id)).json()).text).toBe(replaced);

    await post({
      type: "jd",
      id: crypto.randomUUID(),
      date: yesterday,
      logId: id,
      text: "",
    });
    expect((env.state as GameState).days[yesterday].logs[0].jd).toBeUndefined();
    expect(env.files.size).toBe(0);
    expect((await read(id)).status).toBe(404);
  });
  it("lets only the player write descriptions, and only onto a real record", async () => {
    as(player);
    const id = crypto.randomUUID();
    await post({
      type: "log",
      id,
      date: today(),
      kind: "application",
      count: 1,
      company: "Notion",
      link: "",
    });
    as(referee);
    const denied = await post({
      type: "jd",
      id: crypto.randomUUID(),
      date: today(),
      logId: id,
      text: JD,
    });
    // The pure action layer rejects it, which the route reports as a bad request.
    expect(denied.status).toBe(400);
    expect(denied.body.error).toContain("权限");
    as(player);
    const missing = await post({
      type: "jd",
      id: crypto.randomUUID(),
      date: today(),
      logId: crypto.randomUUID(),
      text: JD,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toContain("找不到");
  });
  it("rejects a description longer than the limit", async () => {
    as(player);
    const tooLong = await post({
      type: "log",
      id: crypto.randomUUID(),
      date: today(),
      kind: "application",
      count: 1,
      company: "",
      link: "",
      jd: "x".repeat(12001),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toContain("12000");
    expect(env.files.size).toBe(0);
  });
});
