import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_STUDY,
  type StudyRules,
  type StudyView,
} from "../src/lib/study";
import type { GameState } from "../src/lib/types";

// Real routes and real study store; Supabase, the clock and the vision model are fakes.
const env = vi.hoisted(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://db.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    REFEREE_KEY: "referee-secret",
    APP_URL: "http://app.test",
    LLM_API_KEY: "",
  });
  type Row = Record<string, unknown>;
  const db = {
    study_sessions: [] as Row[],
    study_strikes: [] as Row[],
    files: new Map<string, Uint8Array>(),
  };
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private single = false;
    constructor(
      private table: "study_sessions" | "study_strikes",
      private op: "select" | "insert" | "update",
      private payload?: Row,
      private columns = "*",
    ) {}
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push((r) => (r[column] ?? null) === value);
      return this;
    }
    not(column: string, _op: string, value: unknown) {
      this.filters.push((r) => (r[column] ?? null) !== value);
      return this;
    }
    order() {
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    then<T>(resolve: (v: unknown) => T, reject?: (e: unknown) => T) {
      return Promise.resolve(this.run()).then(resolve, reject);
    }
    private run() {
      const rows = db[this.table];
      if (this.op === "insert") {
        const row = structuredClone(this.payload!);
        const running =
          this.table === "study_sessions" &&
          row.ended_at == null &&
          rows.some((r) => r.ended_at == null);
        if (rows.some((r) => r.id === row.id) || running)
          return { error: { code: "23505" } };
        rows.push(row);
        return { error: null };
      }
      const hits = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        hits.forEach((r) => Object.assign(r, structuredClone(this.payload)));
        return { error: null };
      }
      const out = hits.map((r) =>
        this.columns.includes("study_strikes")
          ? {
              ...structuredClone(r),
              study_strikes: db.study_strikes
                .filter((s) => s.session_id === r.id)
                .map((s) => structuredClone(s)),
            }
          : structuredClone(r),
      );
      return { data: this.single ? (out[0] ?? null) : out, error: null };
    }
  }
  const client = {
    from: (table: "study_sessions" | "study_strikes") => ({
      select: (columns = "*") => new Query(table, "select", undefined, columns),
      insert: (row: Row) => new Query(table, "insert", row),
      update: (patch: Row) => new Query(table, "update", patch),
    }),
    storage: {
      getBucket: async () => ({ error: null }),
      createBucket: async () => ({ error: null }),
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          db.files.set(path, bytes);
          return { error: null };
        },
        download: async (path: string) => ({
          data: db.files.has(path)
            ? new Blob([new Uint8Array(db.files.get(path)!)])
            : null,
        }),
        remove: async (paths: string[]) => {
          paths.forEach((p) => db.files.delete(p));
          return { error: null };
        },
      }),
    },
  };
  return {
    db,
    client,
    jar: new Map<string, string>(),
    state: undefined as unknown,
    judge: null as null | (() => Promise<unknown>),
    grade: null as null | number,
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
vi.mock("@/lib/server/vision", () => ({
  visionProvider: () =>
    env.judge
      ? { id: "gemini", label: "Google Gemini API（test）", judge: env.judge }
      : null,
}));
vi.mock("@/lib/grading", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  gradeAnswer: async () => ({
    score: env.grade,
    missing: [],
    tip: "写得具体一点",
    model: env.grade === null ? null : "test",
    status: env.grade === null ? "pending" : "graded",
  }),
}));

const auth = await import("../src/app/api/auth/route");
const study = await import("../src/app/api/study/route");
const media = await import("../src/app/api/study/media/route");
const stateRoute = await import("../src/app/api/state/route");
const COOKIE = "offer-quest-session";
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(300, 7),
]).toString("base64");
const START = Date.parse("2026-09-22T14:00:00Z");
const clock = (minutes: number) => vi.setSystemTime(START + minutes * 60_000);

const request = (body: unknown) =>
  new Request("http://app.test/api/study", {
    method: "POST",
    headers: { origin: "http://app.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function post(body: unknown) {
  const res = await study.POST(request(body));
  return {
    status: res.status,
    body: (await res.json()) as StudyView & Record<string, never>,
  };
}
async function view() {
  return (await (await study.GET()).json()) as StudyView;
}
let player = "",
  referee = "";
const as = (token: string) => {
  env.jar.clear();
  env.jar.set(COOKIE, token);
};
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
async function startSession(
  options = { ai: true, screen: false, share: true },
) {
  as(player);
  const res = await post({ type: "start", ...options });
  expect(res.status).toBe(200);
  return res.body.sessions.find((s) => !s.endedAt)!;
}
const pool = async () => {
  const res = await stateRoute.GET();
  return (await res.json()).summary.pool as number;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  clock(0);
  env.db.study_sessions.length = env.db.study_strikes.length = 0;
  env.db.files.clear();
  env.state = undefined;
  env.judge = null;
  env.grade = null;
  player = await enter({ name: "Shan" });
  referee = await enter({ name: "裁判", key: "referee-secret" });
});
afterAll(() => vi.useRealTimers());
/** Today's study rules, for tests that exercise strict mode or other thresholds. */
function useRules(rules: Partial<StudyRules>) {
  const s = env.state as GameState,
    today = Object.keys(s.days).sort().at(-1)!;
  s.days[today].settings.study = { ...DEFAULT_STUDY, ...rules };
}

describe("study sessions", () => {
  it("records gentle reminders once, keeps snapshots only when sharing, and passes on completion", async () => {
    env.judge = async () => ({
      studying: true,
      category: "study",
      confidence: 0.9,
      reason: "在做题",
    });
    const s = await startSession();
    const phone = {
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "phone",
      snapshot: JPEG,
    };
    await post(phone);
    await post(phone);
    clock(0.5);
    await post({ ...phone, id: crypto.randomUUID() });
    let current = (await view()).sessions[0];
    expect(current.strikes).toHaveLength(1);
    expect(current.strikes[0]).toMatchObject({
      kind: "warning",
      source: "phone",
      hasSnapshot: true,
    });
    await post({ type: "share", sessionId: s.id, share: false });
    clock(2);
    await post({
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "absent",
      snapshot: JPEG,
    });
    current = (await view()).sessions[0];
    expect(current.strikes.map((x) => x.hasSnapshot)).toEqual([true, false]);
    for (const minute of [4, 7, 10, 13, 16, 19, 22, 25, 28, 29.5]) {
      clock(minute);
      await post({ type: "heartbeat", sessionId: s.id });
    }
    clock(31);
    expect((await view()).sessions[0].result.status).toBe("summary");
    const done = await post({
      type: "finish",
      sessionId: s.id,
      summary: "学了交叉验证和数据泄漏，下次练习 SQL 窗口函数。",
    });
    expect(done.body.sessions[0].result).toMatchObject({
      status: "passed",
      warnings: 2,
      effective: 1,
    });
  });
  it("reminds only on confident AI verdicts by default", async () => {
    env.judge = async () => ({
      studying: false,
      category: "entertainment",
      confidence: 0.8,
      reason: "好像在看视频",
    });
    const s = await startSession();
    const unsure = await post({
      type: "inspect",
      sessionId: s.id,
      camera: JPEG,
    });
    expect(unsure.body.inspection).toMatchObject({ kind: null });
    clock(1);
    env.judge = async () => ({
      studying: false,
      category: "entertainment",
      confidence: 0.93,
      reason: "屏幕上在放综艺",
    });
    const sure = await post({ type: "inspect", sessionId: s.id, camera: JPEG });
    expect(sure.body.inspection).toMatchObject({ kind: "warning" });
    expect(
      (await view()).sessions[0].strikes.map((x) => [x.kind, x.hasSnapshot]),
    ).toEqual([["warning", true]]);
  });
  it("ignores a check the referee switched off", async () => {
    const s = await startSession();
    await post({
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "look_away",
    });
    expect((await view()).sessions[0].strikes).toEqual([]);
  });
  it("turns AI verdicts into strikes or warnings in strict mode and falls back when the model fails", async () => {
    useRules({ strict: true });
    env.judge = async () => ({
      studying: false,
      category: "entertainment",
      confidence: 0.92,
      reason: "屏幕上在放综艺",
    });
    const s = await startSession();
    const strike = await post({
      type: "inspect",
      sessionId: s.id,
      camera: JPEG,
    });
    expect(strike.body.inspection).toMatchObject({ kind: "strike" });
    const tooSoon = await post({
      type: "inspect",
      sessionId: s.id,
      camera: JPEG,
    });
    expect(tooSoon.status).toBe(429);
    clock(1);
    env.judge = async () => ({
      studying: false,
      category: "chat",
      confidence: 0.8,
      reason: "在用聊天软件",
    });
    expect(
      (await post({ type: "inspect", sessionId: s.id, camera: JPEG })).body
        .inspection,
    ).toMatchObject({ kind: "warning" });
    clock(2);
    env.judge = async () => {
      throw new Error("429 quota");
    };
    expect(
      (await post({ type: "inspect", sessionId: s.id, camera: JPEG })).body
        .inspection,
    ).toEqual({ unavailable: true });
    const strikes = (await view()).sessions[0].strikes;
    expect(strikes.map((x) => [x.kind, x.source, x.reason])).toEqual([
      ["strike", "ai", "屏幕上在放综艺"],
      ["warning", "ai", "在用聊天软件"],
    ]);
    expect(strikes[0].hasSnapshot).toBe(true);
  });
  it("never runs AI checks without consent", async () => {
    env.judge = async () => ({
      studying: false,
      category: "away",
      confidence: 1,
      reason: "没人",
    });
    const s = await startSession({ ai: false, screen: false, share: false });
    expect(
      (await post({ type: "inspect", sessionId: s.id, camera: JPEG })).status,
    ).toBe(400);
  });
  it("fails on the third strike, adds $5 to the pool, and recovers when the referee overturns one", async () => {
    useRules({ strict: true, absentSeconds: 60 });
    const s = await startSession();
    for (const minute of [1, 2.5, 4]) {
      clock(minute);
      await post({
        type: "event",
        sessionId: s.id,
        id: crypto.randomUUID(),
        source: "absent",
      });
    }
    let current = (await view()).sessions[0];
    expect(current.result).toMatchObject({
      status: "active",
      struckOut: true,
      effective: 3,
    });
    expect(await pool()).toBe(5);
    as(player);
    expect(
      (
        await post({
          type: "overturn",
          strikeId: current.strikes[0].id,
          reason: "网断了",
        })
      ).status,
    ).toBe(403);
    as(referee);
    expect(
      (
        await post({
          type: "overturn",
          strikeId: current.strikes[0].id,
          reason: "网断了，不是离开",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          type: "overturn",
          strikeId: current.strikes[0].id,
          reason: "再推翻一次",
        })
      ).status,
    ).toBe(409);
    current = (await view()).sessions[0];
    expect(current.result).toMatchObject({ struckOut: false, effective: 2 });
    expect(current.strikes[0].overturnReason).toBe("网断了，不是离开");
    expect(await pool()).toBe(0);
    expect((env.state as GameState).audit.at(-1)?.action).toBe("studyOverturn");
  });
  it("adds a reminder only for an empty or off-topic summary by default", async () => {
    const s = await startSession();
    clock(1);
    await post({
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "drowsy",
    });
    for (const minute of [3, 6, 9, 12, 15, 18, 21, 24, 27, 29.8]) {
      clock(minute);
      await post({ type: "heartbeat", sessionId: s.id });
    }
    clock(30.5);
    env.grade = 1;
    const done = await post({
      type: "finish",
      sessionId: s.id,
      summary: "今天随便看了看，没什么收获。",
    });
    expect(done.body.sessions[0].result).toMatchObject({
      status: "passed",
      warnings: 2,
      effective: 1,
    });
    expect(done.body.sessions[0].strikes.at(-1)).toMatchObject({
      source: "summary",
      kind: "warning",
    });
  });
  it("allows one pause within the limit and fails a pause that runs over", async () => {
    let s = await startSession();
    clock(2);
    await post({ type: "pause", sessionId: s.id });
    clock(6);
    expect((await post({ type: "resume", sessionId: s.id })).status).toBe(200);
    expect((await view()).sessions[0].endsAt).toBe(
      new Date(START + 34 * 60_000).toISOString(),
    );
    expect((await post({ type: "pause", sessionId: s.id })).status).toBe(409);
    await post({ type: "end", sessionId: s.id });
    clock(7);
    s = await startSession();
    await post({ type: "pause", sessionId: s.id });
    clock(13);
    expect((await post({ type: "resume", sessionId: s.id })).status).toBe(409);
    const sessions = (await view()).sessions;
    expect(sessions.map((x) => x.endReason).sort()).toEqual([
      "ended_early",
      "pause_exceeded",
    ]);
    expect(await pool()).toBe(10);
  });
  it("fails a session whose page stopped reporting and then allows a new one", async () => {
    const s = await startSession();
    clock(4);
    expect(
      (await post({ type: "start", ai: false, screen: false, share: false }))
        .status,
    ).toBe(200);
    const sessions = (await view()).sessions;
    expect(sessions.find((x) => x.id === s.id)).toMatchObject({
      endReason: "abandoned",
    });
    expect(sessions.filter((x) => !x.endedAt)).toHaveLength(1);
  });
  it("lets the referee manage coach photos and keeps snapshots private and deletable", async () => {
    as(player);
    expect(
      (await post({ type: "coachPhoto", mood: "angry", image: JPEG })).status,
    ).toBe(403);
    as(referee);
    const uploaded = await post({
      type: "coachPhoto",
      mood: "angry",
      image: JPEG,
    });
    expect(uploaded.body.coach.photos.angry).toBeTruthy();
    const photo = await media.GET(
      new Request("http://app.test/api/study/media?coach=angry"),
    );
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    const s = await startSession();
    await post({
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "phone",
      snapshot: JPEG,
    });
    const strikeId = (await view()).sessions[0].strikes[0].id;
    as(referee);
    expect(
      (
        await media.GET(
          new Request(`http://app.test/api/study/media?snapshot=${strikeId}`),
        )
      ).status,
    ).toBe(200);
    env.jar.clear();
    expect(
      (
        await media.GET(
          new Request(`http://app.test/api/study/media?snapshot=${strikeId}`),
        )
      ).status,
    ).toBe(401);
    as(player);
    expect((await post({ type: "deleteSnapshots" })).body).toMatchObject({
      deleted: 1,
    });
    expect((await view()).sessions[0].strikes[0].hasSnapshot).toBe(false);
    expect(
      (
        await media.GET(
          new Request(`http://app.test/api/study/media?snapshot=${strikeId}`),
        )
      ).status,
    ).toBe(404);
  });
  it("rejects starting a second session and anything but a JPEG snapshot", async () => {
    const s = await startSession();
    expect(
      (await post({ type: "start", ai: false, screen: false, share: false }))
        .status,
    ).toBe(409);
    const png = Buffer.from("89504e470d0a1a0a".repeat(20), "hex").toString(
      "base64",
    );
    const bad = await post({
      type: "event",
      sessionId: s.id,
      id: crypto.randomUUID(),
      source: "phone",
      snapshot: png,
    });
    expect(bad.status).toBe(400);
  });
});
