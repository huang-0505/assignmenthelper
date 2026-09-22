import { describe, expect, it } from "vitest";
import {
  addDays,
  advance,
  categoryFor,
  closeTime,
  completedBq,
  dayKey,
  DEFAULT_SETTINGS,
  evaluate,
  newGame,
  nextBq,
  requirements,
  selectQuestion,
} from "../src/lib/engine";
import { applyAction, applyGrade, actionSchema } from "../src/lib/actions";
import { DEFAULT_STUDY } from "../src/lib/study";
import type { Day, GameState, Question } from "../src/lib/types";
import data from "../data/questions.json";
const bank = data as Question[];
const noon = (date: string) => `${date}T16:00:00Z`;
function game(date = "2026-09-14") {
  return newGame(noon(date), bank);
}
function finish(day: Day, bonus = false) {
  day.applications = bonus
    ? day.settings.bonusApplications
    : day.settings.applications;
  day.contacts = bonus ? day.settings.bonusContacts : day.settings.contacts;
  day.episodes = day.settings.episodes ?? 0;
  day.answers.push({
    id: crypto.randomUUID(),
    text: "A specific explanation of the evaluation design.",
    submittedAt: noon(day.date),
    grade: {
      score: 3,
      status: "graded",
      missing: [],
      tip: "Good.",
      model: "test",
    },
  });
  if (day.bq) {
    day.bq.text =
      "Situation, task, actions I personally took, and a concrete measurable result.";
    day.bq.practiced = day.bq.stage === 2;
    day.bq.completedAt = noon(day.date);
  }
}
function runDays(state: GameState, count: number, complete = true) {
  for (let i = 0; i < count; i++) {
    const d = addDays(state.startedOn, i);
    advance(state, noon(d), bank);
    if (complete) finish(state.days[d]);
  }
}
describe("daily settlement", () => {
  it("requires every minimum and awards base points on success", () => {
    const s = game();
    finish(s.days[s.startedOn]);
    const r = evaluate(s, noon(s.startedOn));
    expect(r).toMatchObject({ streak: 1, points: 100, pool: 0, freezes: 1 });
    expect(r.days[0].status).toBe("met");
  });
  it.each(["applications", "contacts", "interview", "bq"])(
    "an incomplete %s prevents daily success",
    (field) => {
      const s = game(),
        d = s.days[s.startedOn];
      finish(d);
      if (field === "applications") d.applications = 2;
      if (field === "contacts") d.contacts = 19;
      if (field === "interview") d.answers[0].grade.score = 2;
      if (field === "bq") delete d.bq!.completedAt;
      expect(evaluate(s, noon(s.startedOn)).days[0].status).toBe("open");
    },
  );
  it("does not penalize an incomplete open day", () => {
    expect(evaluate(game(), noon("2026-09-14"))).toMatchObject({
      streak: 0,
      points: 0,
      pool: 0,
      freezes: 1,
    });
  });
  it("awards each threshold bonus once and caps bonus regardless of extra counts", () => {
    const s = game();
    finish(s.days[s.startedOn], true);
    s.days[s.startedOn].applications = 500;
    expect(evaluate(s, noon(s.startedOn)).points).toBe(150);
    expect(evaluate(s, noon(s.startedOn)).days[0].status).toBe("gold");
  });
  it("consumes a freeze at exact midnight and keeps the prior streak", () => {
    const s = game();
    runDays(s, 2);
    advance(s, noon("2026-09-16"), bank);
    advance(s, "2026-09-17T04:00:00Z", bank);
    const r = evaluate(s, "2026-09-17T04:00:00Z");
    expect(r.days[2]).toMatchObject({
      status: "frozen",
      streak: 2,
      points: 0,
      penalty: 0,
    });
    expect(r.freezes).toBe(0);
  });
  it("resets streak and adds penalty after freeze is exhausted", () => {
    const s = game();
    finish(s.days[s.startedOn]);
    advance(s, noon("2026-09-18"), bank);
    const r = evaluate(s, noon("2026-09-18"));
    expect(r.days[1].status).toBe("frozen");
    expect(r.days[2]).toMatchObject({
      status: "missed",
      streak: 0,
      penalty: 10,
    });
    expect(r.pool).toBe(20);
  });
  it("refills weekly, caps storage at two, and does not refill on repeat reads", () => {
    const s = game();
    runDays(s, 22);
    const now = noon("2026-10-05");
    const r = evaluate(s, now);
    expect(r.freezes).toBe(2);
    for (let i = 0; i < 3; i++) {
      advance(s, now, bank);
      expect(evaluate(s, now)).toEqual(r);
    }
  });
  it("grants Monday freeze before evaluating Monday miss", () => {
    const s = game();
    advance(s, noon("2026-09-22"), bank);
    const r = evaluate(s, noon("2026-09-22"));
    expect(r.days.find((d) => d.date === "2026-09-21")?.status).toBe("frozen");
    expect(r.pool).toBe(60);
  });
  it("unlocks 7, 14, 21 milestones once and never on a frozen day", () => {
    const s = game();
    runDays(s, 22);
    const r = evaluate(s, noon("2026-10-05"));
    expect(r.rewards.map((r) => r.streak)).toEqual([7, 14, 21]);
    expect(new Set(r.rewards.map((r) => r.id)).size).toBe(3);
    const s2 = game();
    runDays(s2, 6);
    advance(s2, noon("2026-09-21"), bank);
    expect(evaluate(s2, noon("2026-09-21")).rewards).toHaveLength(0);
  });
  it("redeems pool once, preserves redemption audit and refuses below threshold", () => {
    const s = game();
    const at = noon("2026-09-20");
    advance(s, at, bank);
    expect(evaluate(s, at).pool).toBe(50);
    const a = { type: "redeem" as const, id: crypto.randomUUID() };
    applyAction(s, a, "referee", "ref", at, bank);
    applyAction(s, a, "referee", "ref", at, bank);
    expect(evaluate(s, at).pool).toBe(0);
    expect(s.redemptions).toHaveLength(1);
    expect(() =>
      applyAction(
        s,
        { ...a, id: crypto.randomUUID() },
        "referee",
        "ref",
        at,
        bank,
      ),
    ).toThrow("门槛");
  });
  it("holds chronological settlement only when pending review can change the outcome", () => {
    const s = game();
    const day = s.days[s.startedOn];
    finish(day);
    day.answers[0].grade = {
      score: null,
      status: "pending",
      missing: [],
      tip: "Review",
      model: null,
    };
    advance(s, noon("2026-09-17"), bank);
    const r = evaluate(s, noon("2026-09-17"));
    expect(r.days[0].status).toBe("pending");
    expect(r.days[1].status).toBe("waiting");
    expect(r.pool).toBe(0);
    day.contacts = 0;
    expect(evaluate(s, noon("2026-09-17")).days[0].status).toBe("frozen");
  });
  it("a referee override replays the streak and penalties without duplicate effects", () => {
    const s = game();
    runDays(s, 3);
    s.days[s.startedOn].answers[0].grade.score = 1;
    const at = noon("2026-09-17");
    advance(s, at, bank);
    expect(evaluate(s, at).streak).toBe(2);
    const a = {
      type: "override" as const,
      id: crypto.randomUUID(),
      date: s.startedOn,
      answerId: s.days[s.startedOn].answers[0].id,
      score: 4,
      reason: "Reasoned and sufficient",
    };
    applyAction(s, a, "referee", "ref", at, bank);
    expect(evaluate(s, at)).toMatchObject({
      streak: 3,
      freezes: 1,
      points: 300,
    });
  });
  it("late AI never overwrites a referee decision", () => {
    const s = game();
    finish(s.days[s.startedOn]);
    const a = s.days[s.startedOn].answers[0];
    a.grade.status = "pending";
    a.override = {
      score: 2,
      reason: "Needs detail",
      by: "ref",
      at: noon(s.startedOn),
    };
    applyGrade(s, s.startedOn, a.id, {
      score: 5,
      missing: [],
      tip: "Strong",
      model: "late",
      status: "graded",
    });
    expect(evaluate(s, noon(s.startedOn)).days[0].status).toBe("open");
  });
  it("uses snapshotted thresholds on historical days and activates changes next day", () => {
    const s = game(),
      at = noon(s.startedOn);
    finish(s.days[s.startedOn]);
    applyAction(
      s,
      {
        type: "settings",
        id: crypto.randomUUID(),
        settings: {
          ...s.settings,
          episodes: 1,
          study: DEFAULT_STUDY,
          applications: 8,
          bonusApplications: 10,
          closeHour: 2,
        },
      },
      "referee",
      "ref",
      at,
      bank,
    );
    expect(s.days[s.startedOn].settings.applications).toBe(3);
    advance(s, "2026-09-15T04:00:00Z", bank);
    expect(s.days["2026-09-15"].settings.applications).toBe(8);
    expect(s.days["2026-09-15"].closesAt).toBe("2026-09-16T06:00:00Z");
    expect(evaluate(s, "2026-09-15T04:00:00Z").days[0].status).toBe("met");
  });
});
describe("time boundaries", () => {
  it("uses New York rather than the UTC date", () => {
    expect(dayKey("2026-09-15T03:59:59Z", DEFAULT_SETTINGS)).toBe("2026-09-14");
    expect(dayKey("2026-09-15T04:00:00Z", DEFAULT_SETTINGS)).toBe("2026-09-15");
  });
  it("supports configurable close hour", () => {
    const s = { ...DEFAULT_SETTINGS, closeHour: 3 };
    expect(dayKey("2026-09-15T06:59:59Z", s)).toBe("2026-09-14");
    expect(dayKey("2026-09-15T07:00:00Z", s)).toBe("2026-09-15");
  });
  it("has a 23-hour spring day and 25-hour autumn day", () => {
    expect(
      Date.parse(closeTime("2026-03-08", DEFAULT_SETTINGS)) -
        Date.parse(closeTime("2026-03-07", DEFAULT_SETTINGS)),
    ).toBe(23 * 3600000);
    expect(
      Date.parse(closeTime("2026-11-01", DEFAULT_SETTINGS)) -
        Date.parse(closeTime("2026-10-31", DEFAULT_SETTINGS)),
    ).toBe(25 * 3600000);
  });
  it("resolves nonexistent 02:00 spring cutoff without looping or skipping a day", () => {
    const s = game("2026-03-07");
    s.settings.closeHour = 2;
    s.days[s.startedOn].closesAt = closeTime(s.startedOn, s.settings);
    advance(s, "2026-03-08T07:00:00Z", bank);
    expect(Object.keys(s.days)).toEqual(["2026-03-07", "2026-03-08"]);
  });
  it("alternates Saturday SQL and Python even across year boundaries", () => {
    expect(categoryFor("2026-01-03", DEFAULT_SETTINGS)).not.toBe(
      categoryFor("2026-01-10", DEFAULT_SETTINGS),
    );
    expect(categoryFor("2026-09-19", DEFAULT_SETTINGS)).not.toBe(
      categoryFor("2026-09-26", DEFAULT_SETTINGS),
    );
  });
});
describe("question assignment and BQ", () => {
  it("has all 112 original questions, unique ids and prompts, 3-6 rubric points", () => {
    expect(bank).toHaveLength(112);
    expect(new Set(bank.map((q) => q.id)).size).toBe(112);
    expect(new Set(bank.map((q) => q.prompt)).size).toBe(112);
    for (const [c, n] of [
      ["ML", 40],
      ["AI/LLM", 30],
      ["SQL", 20],
      ["Python", 10],
      ["BQ", 12],
    ] as const)
      expect(bank.filter((q) => q.category === c)).toHaveLength(n);
    for (const q of bank) {
      expect(q.rubric.length).toBeGreaterThanOrEqual(3);
      expect(q.rubric.length).toBeLessThanOrEqual(6);
    }
  });
  it("does not repeat until category exhaustion; failed questions return in the next cycle", () => {
    const s = game();
    s.days = {};
    s.settings.schedule = Array(7).fill("Python");
    for (let i = 0; i < 10; i++) {
      const date = addDays(s.startedOn, i),
        q = selectQuestion(s, date, bank, s.settings)!;
      s.days[date] = {
        date,
        closesAt: closeTime(date, s.settings),
        settings: s.settings,
        question: q,
        applications: 0,
        contacts: 0,
        answers: [],
        logs: [],
        bq: null,
      };
    }
    expect(new Set(Object.values(s.days).map((d) => d.question?.id)).size).toBe(
      10,
    );
    expect(
      selectQuestion(s, addDays(s.startedOn, 10), bank, s.settings)?.id,
    ).toBe("py-01");
  });
  it("keeps the same assignment on repeated reads", () => {
    const s = game();
    const q = s.days[s.startedOn].question;
    advance(s, noon(s.startedOn), bank);
    expect(s.days[s.startedOn].question).toEqual(q);
  });
  it("requires BQ draft and practice on distinct dates", () => {
    const s = game(),
      d = s.days[s.startedOn];
    finish(d);
    expect(nextBq(s, s.startedOn, bank)?.stage).toBe(1);
    advance(s, noon(addDays(s.startedOn, 1)), bank);
    expect(s.days[addDays(s.startedOn, 1)].bq).toMatchObject({
      questionId: "bq-01",
      stage: 2,
    });
  });
  it("removes BQ only after all 24 stages; allows one optional weekly retell", () => {
    const s = game();
    runDays(s, 24);
    const today = addDays(s.startedOn, 24),
      now = noon(today);
    advance(s, now, bank);
    expect([...completedBq(s).values()].filter((p) => p.practice)).toHaveLength(
      12,
    );
    expect(s.days[today].bq).toBeNull();
    finish(s.days[today]);
    const before = evaluate(s, now).points;
    applyAction(
      s,
      {
        id: crypto.randomUUID(),
        type: "retell",
        date: today,
        questionId: "bq-02",
        text: "Retold aloud",
        practiced: true,
      },
      "player",
      "p",
      now,
      bank,
    );
    expect(evaluate(s, now).points).toBe(before + 25);
    expect(() =>
      applyAction(
        s,
        {
          id: crypto.randomUUID(),
          type: "retell",
          date: today,
          questionId: "bq-02",
          text: "Again",
          practiced: true,
        },
        "player",
        "p",
        now,
        bank,
      ),
    ).toThrow("本周");
  });
  it("generates grounded project probes without replacing an existing question", () => {
    const s = game("2026-09-18");
    expect(s.days[s.startedOn].question).toBeNull();
    s.projects = [
      {
        id: crypto.randomUUID(),
        title: "Retention",
        summary: "Predict retention using events",
        role: "Model evaluation",
        methods: "LightGBM",
        metrics: "PR-AUC 0.4",
      },
    ];
    advance(s, noon(s.startedOn), bank);
    expect(s.days[s.startedOn].question?.prompt).toContain("LightGBM");
    const q = s.days[s.startedOn].question;
    s.projects[0].methods = "Regression";
    advance(s, noon(s.startedOn), bank);
    expect(s.days[s.startedOn].question).toEqual(q);
  });
});
describe("validated mutations", () => {
  it("rejects forged referee operations from a player", () => {
    const s = game();
    expect(() =>
      applyAction(
        s,
        {
          type: "settings",
          id: crypto.randomUUID(),
          settings: { ...s.settings, episodes: 1, study: DEFAULT_STUDY },
        },
        "player",
        "p",
        noon(s.startedOn),
        bank,
      ),
    ).toThrow("权限");
  });
  it("rejects player operations by the referee", () => {
    const s = game();
    expect(() =>
      applyAction(
        s,
        {
          type: "log",
          id: crypto.randomUUID(),
          date: s.startedOn,
          kind: "application",
          count: 1,
          company: "",
          link: "",
        },
        "referee",
        "r",
        noon(s.startedOn),
        bank,
      ),
    ).toThrow("权限");
  });
  it("lets only the referee rename the player", () => {
    const s = game(),
      rename = {
        type: "playerName" as const,
        id: crypto.randomUUID(),
        name: "Bella",
      };
    expect(() =>
      applyAction(s, rename, "player", "p", noon(s.startedOn), bank),
    ).toThrow("权限");
    applyAction(s, rename, "referee", "r", noon(s.startedOn), bank);
    expect(s.playerName).toBe("Bella");
  });
  it("rejects backdated submissions at midnight", () => {
    const s = game();
    expect(() =>
      applyAction(
        s,
        {
          type: "answer",
          id: crypto.randomUUID(),
          date: s.startedOn,
          text: "A complete answer with examples",
        },
        "player",
        "p",
        closeTime(s.startedOn, s.settings),
        bank,
      ),
    ).toThrow("已经结束");
  });
  it("deduplicates log requests and supports correction before close", () => {
    const s = game(),
      a = {
        type: "log" as const,
        id: crypto.randomUUID(),
        date: s.startedOn,
        kind: "application" as const,
        count: 3,
        company: "Example",
        link: "",
      };
    applyAction(s, a, "player", "p", noon(s.startedOn), bank);
    applyAction(s, a, "player", "p", noon(s.startedOn), bank);
    expect(s.days[s.startedOn].applications).toBe(3);
    applyAction(
      s,
      {
        type: "removeLog",
        id: crypto.randomUUID(),
        date: s.startedOn,
        logId: a.id,
      },
      "player",
      "p",
      noon(s.startedOn),
      bank,
    );
    expect(s.days[s.startedOn].applications).toBe(0);
  });
  it("validates count, URL schemes, bonus thresholds and unique milestones", () => {
    const base = {
      type: "log",
      id: crypto.randomUUID(),
      date: "2026-09-14",
      kind: "contact",
      count: 1,
      company: "",
      link: "",
    };
    expect(actionSchema.safeParse({ ...base, count: -1 }).success).toBe(false);
    expect(
      actionSchema.safeParse({ ...base, link: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        id: crypto.randomUUID(),
        type: "settings",
        settings: { ...DEFAULT_SETTINGS, bonusContacts: 1 },
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        id: crypto.randomUUID(),
        type: "settings",
        settings: {
          ...DEFAULT_SETTINGS,
          rewards: [
            { streak: 7, text: "one" },
            { streak: 7, text: "two" },
          ],
        },
      }).success,
    ).toBe(false);
  });
  it("limits answer attempts and prevents bypass while review is pending", () => {
    const s = game(),
      a = {
        type: "answer" as const,
        id: crypto.randomUUID(),
        date: s.startedOn,
        text: "A full explanation with examples",
      };
    applyAction(s, a, "player", "p", noon(s.startedOn), bank);
    expect(() =>
      applyAction(
        s,
        { ...a, id: crypto.randomUUID() },
        "player",
        "p",
        noon(s.startedOn),
        bank,
      ),
    ).toThrow("等待裁判");
    for (let i = 0; i < 4; i++) {
      s.days[s.startedOn].answers.at(-1)!.grade = {
        score: 2,
        missing: [],
        tip: "Revise",
        model: "test",
        status: "graded",
      };
      applyAction(
        s,
        { ...a, id: crypto.randomUUID() },
        "player",
        "p",
        noon(s.startedOn),
        bank,
      );
    }
    expect(() =>
      applyAction(
        s,
        { ...a, id: crypto.randomUUID() },
        "player",
        "p",
        noon(s.startedOn),
        bank,
      ),
    ).toThrow("5 次");
  });
});
describe("English episode task", () => {
  it("counts only when exactly the target number of episodes was watched", () => {
    const s = game(),
      d = s.days[s.startedOn];
    finish(d);
    expect(d.settings.episodes).toBe(1);
    for (const [watched, met] of [
      [0, false],
      [1, true],
      [2, false],
    ] as const) {
      d.episodes = watched;
      expect(requirements(d)).toMatchObject({ met, required: 5 });
    }
  });
  it("adds the task to older camps from the open day on, never retroactively", () => {
    const s = game();
    runDays(s, 2);
    // A camp saved before the task existed has no episode fields at all.
    delete s.settings.episodes;
    for (const d of Object.values(s.days)) {
      delete d.settings.episodes;
      delete d.episodes;
    }
    const [closed, open] = [s.startedOn, addDays(s.startedOn, 1)];
    advance(s, noon(open), bank);
    expect(s.settings.episodes).toBe(1);
    expect(s.days[open]).toMatchObject({
      episodes: 0,
      settings: { episodes: 1 },
    });
    expect(s.days[closed].settings.episodes).toBeUndefined();
    expect(requirements(s.days[closed])).toMatchObject({
      met: true,
      required: 4,
    });
    expect(requirements(s.days[open]).met).toBe(false);
  });
  it("does not hold a day for review when the episode count is off", () => {
    const s = game(),
      d = s.days[s.startedOn],
      after = noon(addDays(s.startedOn, 1));
    finish(d);
    d.answers[0].grade = {
      ...d.answers[0].grade,
      score: null,
      status: "pending",
    };
    d.episodes = 2;
    expect(evaluate(s, after).days[0].status).toBe("frozen");
    d.episodes = 1;
    expect(evaluate(s, after).days[0].status).toBe("pending");
  });
  it("lets only the player record today's episodes", () => {
    const s = game(),
      a = {
        type: "episodes" as const,
        id: crypto.randomUUID(),
        date: s.startedOn,
        count: 1,
        note: "Friends S01E01",
      };
    expect(() =>
      applyAction(s, a, "referee", "r", noon(s.startedOn), bank),
    ).toThrow("权限");
    applyAction(s, a, "player", "p", noon(s.startedOn), bank);
    expect(s.days[s.startedOn]).toMatchObject({
      episodes: 1,
      episodeNote: "Friends S01E01",
    });
  });
});
