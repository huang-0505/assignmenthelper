import { describe, expect, it } from "vitest";
import { actionSchema, applyAction } from "../src/lib/actions";
import { evaluate, newGame, weekKey } from "../src/lib/engine";
import {
  DEFAULT_STUDY,
  studyRewards,
  type StudyOutcome,
} from "../src/lib/study";
import type { Question } from "../src/lib/types";
import bankData from "../data/questions.json";
const bank = bankData as Question[];
const now = "2026-09-22T15:00:00Z";
const outcome = (
  n: number,
  minutes = 20,
  overrides: Partial<StudyOutcome> = {},
): StudyOutcome => ({
  id: `session-${n}`,
  startedAt: new Date(Date.parse(now) + n * 3600000).toISOString(),
  day: "2026-09-22",
  passed: true,
  failed: false,
  minutes,
  tiered: true,
  points: DEFAULT_STUDY.rewardTiers![minutes as 20 | 30 | 45],
  penalty: 5,
  dailyRewardLimit: 5,
  ...overrides,
});

describe("shared daily study rewards", () => {
  it("pays the first five passes across all durations, independent of database order", () => {
    const sessions = [20, 30, 45, 20, 45, 45].map((m, i) => outcome(i, m));
    const rewards = studyRewards(sessions.toReversed());
    expect(rewards.map((o) => o.id)).toEqual(
      sessions.slice(0, 5).map((o) => o.id),
    );
    expect(rewards.reduce((sum, o) => sum + o.points, 0)).toBe(135);
    expect(studyRewards([...sessions, ...sessions])).toEqual(rewards);
  });
  it("does not consume slots on failures; recalculates the allocation after an override", () => {
    const sessions = Array.from({ length: 6 }, (_, i) =>
      outcome(i, i === 0 ? 45 : 20),
    );
    sessions[0].passed = false;
    sessions[0].failed = true;
    expect(studyRewards(sessions).map((o) => o.id)).not.toContain("session-0");
    sessions[0].passed = true;
    sessions[0].failed = false;
    expect(studyRewards(sessions).map((o) => o.id)).toEqual(
      sessions.slice(0, 5).map((o) => o.id),
    );
  });
  it("uses the stored custom limit, resets by training day and preserves stored points", () => {
    const sessions = Array.from({ length: 3 }, (_, i) =>
      outcome(i, 30, { dailyRewardLimit: 2, points: 37 }),
    );
    sessions.push(outcome(4, 45, { day: "2026-09-23", dailyRewardLimit: 1 }));
    expect(studyRewards(sessions).reduce((sum, o) => sum + o.points, 0)).toBe(
      114,
    );
  });
  it("preserves once-per-day legacy rewards and counts one legacy reward toward the new cap", () => {
    const old = [
      outcome(0, 90, { tiered: false, points: 25 }),
      outcome(1, 50, { tiered: false, points: 25 }),
    ];
    expect(studyRewards(old)).toHaveLength(1);
    expect(
      studyRewards([
        ...old,
        ...Array.from({ length: 5 }, (_, i) => outcome(i + 2)),
      ]),
    ).toHaveLength(5);
  });
  it("integrates rewards into daily settlement only when required tasks are met", () => {
    const state = newGame(now, bank),
      day = state.days[state.startedOn];
    const sessions = Array.from({ length: 6 }, (_, i) => outcome(i, 30));
    expect(evaluate(state, now, sessions).points).toBe(0);
    day.applications = day.settings.applications;
    day.contacts = day.settings.contacts;
    day.episodes = day.settings.episodes;
    day.answers.push({
      id: crypto.randomUUID(),
      text: "answer",
      submittedAt: now,
      grade: {
        score: 4,
        status: "graded",
        missing: [],
        tip: "",
        model: "test",
      },
    });
    if (day.bq) {
      day.bq.text = "STAR draft with concrete situation, action and result.";
      day.bq.completedAt = now;
    }
    expect(
      evaluate(state, now, sessions).points - evaluate(state, now).points,
    ).toBe(125);
    expect(evaluate(state, now, sessions)).toEqual(
      evaluate(state, now, sessions),
    );
  });
});

describe("coach weekly plans", () => {
  const plan = {
    weekOf: "2026-09-21",
    goal: "重点投递，复盘项目",
    outreach: "联系五位校友",
    focus: "时间切分与指标",
    days: ["投递和 SQL", "Networking", "", "", "项目", "", "复盘"],
    success: "解释清楚方法和业务影响",
  };
  it("publishes immediately without changing daily requirements, and deduplicates retries", () => {
    const state = newGame(now, bank),
      settings = structuredClone(state.settings);
    const action = actionSchema.parse({
      id: crypto.randomUUID(),
      type: "weeklyPlan",
      plan,
    });
    applyAction(state, action, "referee", "coach", now, bank);
    applyAction(state, action, "referee", "coach", now, bank);
    expect(state.weeklyPlans?.[weekKey(state.startedOn)]).toEqual({
      ...plan,
      updatedAt: now,
    });
    expect(state.settings).toEqual(settings);
    expect(state.audit.filter((a) => a.action === "weeklyPlan")).toHaveLength(
      1,
    );
  });
  it("denies player edits and rejects past weeks, non-Mondays and distant weeks", () => {
    const state = newGame(now, bank);
    const action = actionSchema.parse({
      id: crypto.randomUUID(),
      type: "weeklyPlan",
      plan,
    });
    if (action.type !== "weeklyPlan") throw new Error("Unexpected action");
    expect(() =>
      applyAction(state, action, "player", "player", now, bank),
    ).toThrow("权限");
    for (const weekOf of ["2026-09-14", "2026-09-22", "2026-10-05"])
      expect(() =>
        applyAction(
          state,
          { ...action, plan: { ...plan, weekOf } },
          "referee",
          "coach",
          now,
          bank,
        ),
      ).toThrow("本周或下周");
    applyAction(
      state,
      { ...action, plan: { ...plan, weekOf: "2026-09-28" } },
      "referee",
      "coach",
      now,
      bank,
    );
    expect(state.weeklyPlans?.["2026-09-28"]?.goal).toBe(plan.goal);
  });
  it("validates seven day entries and a nonempty goal", () => {
    expect(
      actionSchema.safeParse({
        id: crypto.randomUUID(),
        type: "weeklyPlan",
        plan: { ...plan, days: [] },
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        id: crypto.randomUUID(),
        type: "weeklyPlan",
        plan: { ...plan, goal: " " },
      }).success,
    ).toBe(false);
  });
});
