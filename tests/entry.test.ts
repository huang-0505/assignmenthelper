import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../src/lib/types";

// The routes run for real; only the cookie jar and the database row are in memory.
const env = vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://db.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    REFEREE_KEY: "referee-secret",
    APP_URL: "http://app.test",
  });
  return { jar: new Map<string, string>(), state: undefined as unknown };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      env.jar.has(name) ? { name, value: env.jar.get(name)! } : undefined,
    set: (name: string, value: string) => void env.jar.set(name, value),
    delete: (name: string) => void env.jar.delete(name),
  }),
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
vi.mock("@/lib/server/study", () => ({ loadOutcomes: async () => [] }));
const auth = await import("../src/app/api/auth/route");
const stateRoute = await import("../src/app/api/state/route");
const actionRoute = await import("../src/app/api/action/route");
const COOKIE = "offer-quest-session";

function post(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  origin = "http://app.test",
) {
  return handler(
    new Request("http://app.test/api", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
const enter = (body: unknown, origin?: string) => post(auth.POST, body, origin);
async function me() {
  const res = await stateRoute.GET();
  return { status: res.status, body: await res.json() };
}
function signedInAs(token: string | undefined) {
  env.jar.clear();
  if (token) env.jar.set(COOKIE, token);
}

beforeEach(() => {
  env.jar.clear();
  env.state = undefined;
});
describe("name entry without accounts", () => {
  it("lets the first name claim the player, then only that name enters", async () => {
    expect((await enter({ name: "  Amy " })).status).toBe(200);
    expect(await me()).toMatchObject({
      status: 200,
      body: { role: "player", name: "Amy" },
    });
    signedInAs(undefined);
    expect((await enter({ name: "amy" })).status).toBe(200);
    expect((await me()).body.name).toBe("Amy");
    signedInAs(undefined);
    const stranger = await enter({ name: "Stranger" });
    expect(stranger.status).toBe(400);
    expect((await stranger.json()).error).toContain("已经有玩家");
    expect(env.jar.has(COOKIE)).toBe(false);
  });
  it("requires a name and a visit before any state is readable", async () => {
    expect((await me()).status).toBe(401);
    expect((await enter({ name: "   " })).status).toBe(400);
    expect(env.jar.has(COOKIE)).toBe(false);
  });
  it("admits the referee only with the secret key", async () => {
    const wrong = await enter({ name: "裁判", key: "guess" });
    expect(wrong.status).toBe(403);
    expect(env.jar.has(COOKIE)).toBe(false);
    expect((await enter({ name: "裁判", key: "referee-secret" })).status).toBe(
      200,
    );
    expect((await me()).body).toMatchObject({ role: "referee", name: "裁判" });
  });
  it("rejects forged and tampered session cookies", async () => {
    await enter({ name: "Amy" });
    const [payload, signature] = env.jar.get(COOKIE)!.split(".");
    const forged = Buffer.from(
      JSON.stringify({ role: "referee", name: "Amy" }),
    ).toString("base64url");
    signedInAs(`${forged}.${signature}`);
    expect((await me()).status).toBe(401);
    signedInAs(`${payload}.${signature}x`);
    expect((await me()).status).toBe(401);
    signedInAs(forged);
    expect((await me()).status).toBe(401);
  });
  it("signs the old player out when the referee renames the player", async () => {
    await enter({ name: "Amy" });
    const player = env.jar.get(COOKIE);
    await enter({ name: "裁判", key: "referee-secret" });
    const rename = await post(actionRoute.POST, {
      id: crypto.randomUUID(),
      type: "playerName",
      name: "Bella",
    });
    expect(rename.status).toBe(200);
    signedInAs(player);
    expect((await me()).status).toBe(403);
    const blocked = await post(actionRoute.POST, {
      id: crypto.randomUUID(),
      type: "log",
      date: (env.state as GameState).startedOn,
      kind: "application",
      count: 1,
      company: "",
      link: "",
    });
    expect(blocked.status).toBe(403);
    expect((await enter({ name: "Amy" })).status).toBe(400);
    expect((await enter({ name: "Bella" })).status).toBe(200);
    expect((await me()).body.name).toBe("Bella");
  });
  it("rejects cross-site entry and clears the session on exit", async () => {
    expect((await enter({ name: "Amy" }, "https://evil.example")).status).toBe(
      403,
    );
    await enter({ name: "Amy" });
    expect((await enter({ type: "logout" })).status).toBe(200);
    expect(env.jar.has(COOKIE)).toBe(false);
    expect((await me()).status).toBe(401);
  });
});
