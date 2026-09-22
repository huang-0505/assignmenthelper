import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAction } from "../src/lib/actions";
import { MEDIAPIPE_VERSION } from "../src/lib/study-detector";
import { advance, evaluate, newGame } from "../src/lib/engine";
import {
  calibrate,
  DEFAULT_STUDY,
  headPose,
  inspectionAction,
  inspectionDelay,
  localKind,
  SignalTracker,
  studyOutcome,
  studyResult,
  weakSummary,
  type Sample,
  type StudyRules,
  type StudySession,
  type StudyStrike,
} from "../src/lib/study";
import type { Day, Question } from "../src/lib/types";
import data from "../data/questions.json";
const bank = data as Question[];

const START = "2026-09-22T14:00:00.000Z";
const at = (minutes: number) =>
  new Date(Date.parse(START) + minutes * 60_000).toISOString();
function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: crypto.randomUUID(),
    day: "2026-09-22",
    startedAt: START,
    endsAt: at(30),
    lastSeenAt: at(30),
    pausedAt: null,
    pausedMs: 0,
    pauseUsed: false,
    endedAt: at(31),
    endReason: "completed",
    rules: structuredClone(DEFAULT_STUDY),
    layers: { ai: false, screen: false },
    share: false,
    summary: "Learned X.\nPracticed Y.\nNext: Z.",
    summaryGrade: { score: 4, tip: "" },
    strikes: [],
    ...overrides,
  };
}
function strike(
  kind: StudyStrike["kind"],
  overturned = false,
  source: StudyStrike["source"] = "phone",
): StudyStrike {
  return {
    id: crypto.randomUUID(),
    at: at(5),
    kind,
    source,
    reason: "镜头里出现了手机",
    confidence: null,
    hasSnapshot: false,
    overturnedAt: overturned ? at(40) : null,
    overturnReason: overturned ? "误判" : null,
  };
}
function metDay(day: Day) {
  day.applications = day.settings.applications;
  day.contacts = day.settings.contacts;
  day.episodes = day.settings.episodes ?? 0;
  day.answers.push({
    id: crypto.randomUUID(),
    text: "A specific explanation of the evaluation design.",
    submittedAt: at(0),
    grade: { score: 4, status: "graded", missing: [], tip: "", model: "test" },
  });
  if (day.bq) {
    day.bq.text =
      "Situation, task, action and a concrete measurable result here.";
    day.bq.completedAt = at(0);
  }
}

describe("strike aggregation", () => {
  it("converts every two warnings into one strike and ignores overturned events", () => {
    const r = studyResult(
      session({
        strikes: [
          strike("strike"),
          strike("warning"),
          strike("warning"),
          strike("warning"),
          strike("strike", true),
        ],
      }),
      at(40),
    );
    expect(r).toMatchObject({
      strikes: 1,
      warnings: 3,
      effective: 2,
      struckOut: false,
    });
    expect(r.status).toBe("passed");
  });
  it("fails a completed session on the third strike", () => {
    const s = session({
      strikes: [
        strike("strike"),
        strike("strike"),
        strike("warning"),
        strike("warning"),
      ],
    });
    expect(studyResult(s, at(40))).toMatchObject({
      status: "failed",
      effective: 3,
      struckOut: true,
    });
  });
  it("counts a struck-out session that is still running as failed for the penalty", () => {
    const s = session({
      endedAt: null,
      endReason: null,
      lastSeenAt: at(10),
      strikes: [strike("strike"), strike("strike"), strike("strike")],
    });
    expect(studyResult(s, at(10)).status).toBe("active");
    expect(studyOutcome(s, at(10))).toMatchObject({
      failed: true,
      passed: false,
    });
  });
  it("passes again when the referee overturns a strike on a completed session", () => {
    const strikes = [strike("strike"), strike("strike"), strike("strike")];
    const s = session({ strikes });
    expect(studyResult(s, at(40)).status).toBe("failed");
    strikes[2].overturnedAt = at(45);
    expect(studyResult(s, at(46))).toMatchObject({
      status: "passed",
      effective: 2,
    });
  });
  it("never lets an early exit pass, even after overturns", () => {
    const s = session({
      endedAt: at(12),
      endReason: "ended_early",
      strikes: [strike("strike", true)],
    });
    expect(studyResult(s, at(40))).toMatchObject({
      status: "failed",
      studiedMinutes: 12,
    });
  });
});

describe("session timing", () => {
  const running = (overrides: Partial<StudySession>) =>
    session({ endedAt: null, endReason: null, ...overrides });
  it("treats a page that stopped reporting mid-session as abandoned", () => {
    expect(studyResult(running({ lastSeenAt: at(10) }), at(12)).status).toBe(
      "active",
    );
    expect(studyResult(running({ lastSeenAt: at(10) }), at(14))).toMatchObject({
      status: "failed",
      endReason: "abandoned",
    });
  });
  it("waits for the summary only when she stayed until the timer ended", () => {
    expect(studyResult(running({ lastSeenAt: at(29.9) }), at(35)).status).toBe(
      "summary",
    );
    expect(studyResult(running({ lastSeenAt: at(20) }), at(35))).toMatchObject({
      status: "failed",
      endReason: "abandoned",
    });
  });
  it("allows one pause up to the configured length", () => {
    const paused = running({
      pausedAt: at(10),
      pauseUsed: true,
      lastSeenAt: at(10),
    });
    expect(studyResult(paused, at(15)).status).toBe("paused");
    expect(studyResult(paused, at(16))).toMatchObject({
      status: "failed",
      endReason: "pause_exceeded",
    });
  });
});

describe("settlement", () => {
  it("adds bonus points only on a met day and turns it gold", () => {
    const s = newGame(at(1), bank),
      day = s.days[s.startedOn],
      passed = studyOutcome(session({ day: s.startedOn }), at(40));
    expect(evaluate(s, at(40), [passed]).points).toBe(0);
    metDay(day);
    const plain = evaluate(s, at(40)),
      studied = evaluate(s, at(40), [passed]);
    expect(studied.points - plain.points).toBe(DEFAULT_STUDY.points);
    expect(studied.days[0]).toMatchObject({
      status: "gold",
      study: { passed: 1, failed: 0 },
    });
  });
  it("adds a failed session's penalty to the pool and removes it after an overturn", () => {
    const s = newGame(at(1), bank),
      strikes = [strike("strike"), strike("strike"), strike("strike")],
      failed = session({ day: s.startedOn, strikes });
    const before = evaluate(s, at(40), [studyOutcome(failed, at(40))]);
    expect(before.pool).toBe(DEFAULT_STUDY.penalty);
    expect(before.days[0].study).toEqual({ passed: 0, failed: 1 });
    strikes[0].overturnedAt = at(41);
    expect(evaluate(s, at(42), [studyOutcome(failed, at(42))]).pool).toBe(0);
  });
  it("lets the referee redeem a pool that includes study penalties", () => {
    const s = newGame(at(1), bank);
    s.settings.penaltyThreshold = 10;
    const failed = [1, 2].map(() =>
      studyOutcome(
        session({ day: s.startedOn, endReason: "ended_early", endedAt: at(5) }),
        at(40),
      ),
    );
    const redeem = { type: "redeem" as const, id: crypto.randomUUID() };
    expect(() => applyAction(s, redeem, "referee", "r", at(40), bank)).toThrow(
      "门槛",
    );
    applyAction(s, redeem, "referee", "r", at(40), bank, failed);
    expect(s.redemptions[0].amount).toBe(10);
    expect(evaluate(s, at(41), failed).pool).toBe(0);
  });
  it("gives camps created before Study Mode the default rules from the open day", () => {
    const s = newGame(at(1), bank);
    delete s.settings.study;
    delete s.days[s.startedOn].settings.study;
    advance(s, at(2), bank);
    expect(s.settings.study).toEqual(DEFAULT_STUDY);
    expect(s.days[s.startedOn].settings.study).toEqual(DEFAULT_STUDY);
  });
  it("lets only the referee edit the coach lines", () => {
    const s = newGame(at(1), bank),
      action = {
        type: "coachLines" as const,
        id: crypto.randomUUID(),
        lines: { calm: "看看你。", angry: "抓到了！", pleased: "不错。" },
      };
    expect(() => applyAction(s, action, "player", "p", at(2), bank)).toThrow(
      "权限",
    );
    applyAction(s, action, "referee", "r", at(2), bank);
    expect(s.coach?.lines?.angry).toBe("抓到了！");
  });
});

describe("AI inspection verdicts", () => {
  const gentle = DEFAULT_STUDY,
    strict = { ...DEFAULT_STUDY, strict: true };
  const v = (
    category: Parameters<typeof inspectionAction>[0]["category"],
    confidence: number,
    rules = gentle,
  ) =>
    inspectionAction(
      { studying: false, category, confidence, reason: "" },
      rules,
    );
  it("only reminds on an unmistakable lapse by default, never strikes", () => {
    expect(v("entertainment", 0.84)).toBeNull();
    expect(v("entertainment", 0.85)).toBe("warning");
    expect(v("away", 0.99)).toBe("warning");
    expect(v("chat", 0.89)).toBeNull();
    expect(v("chat", 0.9)).toBe("warning");
    expect(v("unclear", 1)).toBeNull();
    expect(v("study", 1)).toBeNull();
  });
  it("uses the tighter confidence bands in strict mode", () => {
    expect(v("entertainment", 0.7, strict)).toBe("strike");
    expect(v("away", 0.95, strict)).toBe("strike");
    expect(v("entertainment", 0.6, strict)).toBe("warning");
    expect(v("away", 0.49, strict)).toBeNull();
    expect(v("chat", 0.9, strict)).toBe("warning");
    expect(v("chat", 0.3, strict)).toBeNull();
    expect(v("unclear", 1, strict)).toBeNull();
  });
  it("turns local lapses and weak recaps into reminders unless strict", () => {
    expect(localKind("absent", gentle)).toBe("warning");
    expect(localKind("phone", gentle)).toBe("warning");
    expect(localKind("absent", strict)).toBe("strike");
    expect(localKind("drowsy", strict)).toBe("warning");
    expect([1, 2, null].map((score) => weakSummary(score, gentle))).toEqual([
      true,
      false,
      false,
    ]);
    expect([2, 3].map((score) => weakSummary(score, strict))).toEqual([
      true,
      false,
    ]);
  });
  it("schedules inspections anywhere inside the configured gap", () => {
    expect(inspectionDelay(DEFAULT_STUDY, () => 0)).toBe(3 * 60_000);
    expect(inspectionDelay(DEFAULT_STUDY, () => 1)).toBe(8 * 60_000);
    expect(
      inspectionDelay({ ...DEFAULT_STUDY, minGap: 9, maxGap: 4 }, () => 0),
    ).toBe(4 * 60_000);
  });
});

describe("local signals", () => {
  const baseline = { yaw: 0, pitch: -10 };
  function run(samples: Partial<Sample>[], rules: Partial<StudyRules> = {}) {
    const tracker = new SignalTracker({ ...DEFAULT_STUDY, ...rules }, baseline);
    return samples.flatMap((s, i) =>
      tracker
        .update({
          t: i * 2000,
          present: true,
          phone: false,
          pose: baseline,
          blink: 0.1,
          ...s,
        })
        .map((e) => `${i * 2}s:${e}`),
    );
  }
  const repeat = (n: number, sample: Partial<Sample>) =>
    Array.from({ length: n }, () => sample);
  it("reminds only after three minutes away by default, then again for each further lapse", () => {
    expect(run(repeat(90, { present: false }))).toEqual([]);
    expect(run(repeat(182, { present: false }))).toEqual([
      "180s:absent",
      "360s:absent",
    ]);
    expect(run(repeat(62, { present: false }), { absentSeconds: 60 })).toEqual([
      "60s:absent",
      "120s:absent",
    ]);
    expect(
      run([{ present: false }, {}, { present: false }], { absentSeconds: 10 }),
    ).toEqual([]);
  });
  it("needs a phone in 4 of 5 samples by default and leaves two minutes between reminders", () => {
    expect(
      run([{ phone: true }, {}, { phone: true }, {}, { phone: true }]),
    ).toEqual([]);
    expect(
      run([{ phone: true }, {}, { phone: true }, {}, { phone: true }], {
        phoneHits: 3,
      }),
    ).toEqual(["8s:phone"]);
    expect(run(repeat(70, { phone: true }))).toEqual([
      "6s:phone",
      "126s:phone",
    ]);
  });
  it("does not watch head direction by default, since reading from paper looks the same", () => {
    expect(run(repeat(200, { pose: { yaw: 60, pitch: 40 } }))).toEqual([]);
    const rules = { lookAwaySeconds: 90, yawTolerance: 25, pitchTolerance: 20 };
    expect(run(repeat(47, { pose: { yaw: 40, pitch: -10 } }), rules)).toEqual([
      "90s:look_away",
    ]);
    expect(run(repeat(60, { pose: { yaw: 20, pitch: 5 } }), rules)).toEqual([]);
  });
  it("reminds after a full minute of closed eyes, not after a short rest", () => {
    expect(run(repeat(25, { blink: 0.8 }))).toEqual([]);
    expect(run(repeat(31, { blink: 0.8 }))).toEqual(["60s:drowsy"]);
    expect(run(repeat(12, { blink: 0.8 }), { drowsySeconds: 20 })).toEqual([
      "20s:drowsy",
    ]);
    expect(run(repeat(40, { blink: 0.8 }), { drowsySeconds: 0 })).toEqual([]);
  });
});

describe("head pose", () => {
  it("loads the MediaPipe WASM that matches the installed package", () => {
    const pkg = JSON.parse(
      readFileSync("node_modules/@mediapipe/tasks-vision/package.json", "utf8"),
    );
    expect(MEDIAPIPE_VERSION).toBe(pkg.version);
  });
  const rotationY = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    // Column-major 4×4 rotation about the vertical axis.
    return [
      Math.cos(a),
      0,
      -Math.sin(a),
      0,
      0,
      1,
      0,
      0,
      Math.sin(a),
      0,
      Math.cos(a),
      0,
      0,
      0,
      0,
      1,
    ];
  };
  const rotationX = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [
      1,
      0,
      0,
      0,
      0,
      Math.cos(a),
      Math.sin(a),
      0,
      0,
      -Math.sin(a),
      Math.cos(a),
      0,
      0,
      0,
      0,
      1,
    ];
  };
  it("recovers yaw and pitch from the transformation matrix", () => {
    const yaw = headPose(rotationY(30)),
      pitch = headPose(rotationX(-15));
    expect(yaw.yaw).toBeCloseTo(30);
    expect(yaw.pitch).toBeCloseTo(0);
    expect(pitch.pitch).toBeCloseTo(-15);
    expect(pitch.yaw).toBeCloseTo(0);
  });
  it("calibrates to the median pose and rejects a mostly missing face", () => {
    expect(
      calibrate([
        { yaw: 1, pitch: -9 },
        { yaw: 50, pitch: 30 },
        { yaw: 2, pitch: -11 },
        { yaw: 3, pitch: -10 },
        null,
      ]),
    ).toEqual({ yaw: 2.5, pitch: -9.5 });
    expect(calibrate([null, null, { yaw: 0, pitch: 0 }])).toBeNull();
  });
});
