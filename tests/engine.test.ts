import { describe, expect, it } from "vitest";
import {
  addDays,
  advance,
  categoryFor,
  closeTime,
  coreOf,
  dayKey,
  DEFAULT_SETTINGS,
  evaluate,
  interviewItems,
  newGame,
  requirements,
  retryQueue,
  retrySource,
  selectQuestion,
} from "../src/lib/engine";
import { applyAction, applyGrade, actionSchema } from "../src/lib/actions";
import { DEFAULT_STUDY } from "../src/lib/study";
import type { Day, GameState, Question, Settings } from "../src/lib/types";
import data from "../data/questions.json";
const bank = data as Question[];
const noon = (date: string) => `${date}T16:00:00Z`;
function game(date = "2026-09-14") {
  return newGame(noon(date), bank);
}
/** A camp with one question a day, as it was before the interview grew to three. */
function oneQuestionGame(date = "2026-09-14") {
  const s = game(date);
  s.settings.questions = 1;
  s.days[s.startedOn].settings.questions = 1;
  delete s.days[s.startedOn].more;
  return s;
}
/** Rules from before BQ and the English task were retired. */
const OLD_RULES = {
  episodes: 1,
  core: {
    applications: false,
    contacts: false,
    interview: true,
    bq: true,
    episodes: true,
  },
};
function finish(day: Day, bonus = false) {
  day.applications = bonus
    ? day.settings.bonusApplications
    : day.settings.applications;
  day.contacts = bonus ? day.settings.bonusContacts : day.settings.contacts;
  day.episodes = day.settings.episodes ?? 0;
  // A project day before any project has no question; the answer then sits on the day.
  const items = interviewItems(day);
  for (const answers of items.length
    ? items.map((item) => item.answers)
    : [day.answers])
    answers.push({
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
  it("updates unanswered question wording without changing assignments or answered history", () => {
    const state = game();
    const day = state.days[state.startedOn];
    const original = structuredClone(day.question!);
    const revisedBank = bank.map((question) =>
      question.id === original.id
        ? { ...question, prompt: "Same problem, clearer wording." }
        : question,
    );
    advance(state, noon(state.startedOn), revisedBank);
    expect(day.question).toEqual({
      ...original,
      prompt: "Same problem, clearer wording.",
    });

    finish(day);
    advance(state, noon(state.startedOn), bank);
    expect(day.question?.prompt).toBe("Same problem, clearer wording.");

    const unanswered = game();
    const current = unanswered.days[unanswered.startedOn].question!;
    const changedRubric = revisedBank.map((question) =>
      question.id === current.id
        ? { ...question, rubric: ["New topic"] }
        : question,
    );
    advance(unanswered, noon(unanswered.startedOn), changedRubric);
    expect(current.prompt).toBe(original.prompt);
  });
  it("refreshes saved default 21-day rewards while preserving custom rewards", () => {
    const state = game();
    runDays(state, 21);
    state.nextSettings = structuredClone(state.settings);
    const savedSettings = [
      state.settings,
      state.nextSettings,
      ...Object.values(state.days).map((day) => day.settings),
    ];
    for (const settings of savedSettings)
      settings.rewards.find((reward) => reward.streak === 21)!.text =
        "一份裁判用心挑的小礼物！";
    state.nextSettings.rewards.find((reward) => reward.streak === 21)!.text =
      "自选奖励";
    const before = evaluate(state, noon("2026-10-04"));

    advance(state, noon("2026-10-04"), bank);

    expect(
      state.settings.rewards.find((reward) => reward.streak === 21)?.text,
    ).toBe("秘密奖励（后面）");
    expect(
      state.nextSettings.rewards.find((reward) => reward.streak === 21)?.text,
    ).toBe("自选奖励");
    const after = evaluate(state, noon("2026-10-04"));
    expect(after.rewards.find((reward) => reward.streak === 21)?.text).toBe(
      "秘密奖励（后面）",
    );
    expect(after).toEqual({
      ...before,
      rewards: before.rewards.map((reward) =>
        reward.streak === 21 ? { ...reward, text: "秘密奖励（后面）" } : reward,
      ),
    });
  });
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
      // Outreach only blocks the day once the referee makes it part of the streak.
      if (field === "applications" || field === "contacts")
        d.settings.core = { ...coreOf(d.settings), [field]: true };
      if (field === "applications") d.applications = 2;
      if (field === "contacts") d.contacts = 19;
      if (field === "interview") d.answers[0].grade.score = 2;
      // Days from before BQ was retired still need the BQ they had.
      if (field === "bq") {
        d.settings.core = { ...coreOf(d.settings), bq: true };
        d.bq = { questionId: "bq-01", stage: 1, text: "", practiced: false };
      }
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
    // 100 base, one application bonus, and the week's application target reached at once.
    expect(evaluate(s, noon(s.startedOn)).points).toBe(175);
    expect(evaluate(s, noon(s.startedOn)).days[0].status).toBe("gold");
  });
  it("counts outreach toward the week, not the streak, and pays each weekly target once", () => {
    const s = game();
    const first = s.days[s.startedOn];
    finish(first);
    first.applications = first.contacts = 0;
    let r = evaluate(s, noon(s.startedOn));
    expect(r.days[0]).toMatchObject({ status: "met", points: 100 });
    expect(requirements(first)).toEqual({
      completed: 3,
      required: 3,
      met: true,
    });
    first.applications = 15;
    r = evaluate(s, noon(s.startedOn));
    expect(r.days[0]).toMatchObject({ status: "gold", points: 150 });
    // The next day adds more applications: the daily bonus again, the weekly one not.
    const second = addDays(s.startedOn, 1);
    advance(s, noon(second), bank);
    finish(s.days[second]);
    s.days[second].applications = 15;
    expect(evaluate(s, noon(second)).days[1].points).toBe(125);
    // A new week pays again, and a missed week never pays.
    const monday = addDays(s.startedOn, 7);
    advance(s, noon(monday), bank);
    s.days[monday].applications = 15;
    expect(evaluate(s, noon(monday)).days.at(-1)).toMatchObject({
      status: "open",
      points: 25,
    });
    // Old snapshots without the split still require everything.
    delete first.settings.core;
    expect(requirements(first)).toMatchObject({ required: 5, met: false });
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
    // Outreach is not part of the streak by default, so it cannot decide the day either.
    day.contacts = 0;
    expect(evaluate(s, noon("2026-09-17")).days[0].status).toBe("pending");
    // Another question already below 3: the review cannot make the day pass.
    interviewItems(day)[1].answers[0].grade.score = 2;
    expect(evaluate(s, noon("2026-09-17")).days[0].status).toBe("frozen");
    interviewItems(day)[1].answers[0].grade.score = 3;
    // An older day with the English task still needs its episode.
    Object.assign(day.settings, structuredClone(OLD_RULES));
    day.episodes = 0;
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
          ...(s.settings as Required<Settings>),
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
describe("question assignment", () => {
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
  it("brings a weak answer back once, five days later, in the same category", () => {
    const s = oneQuestionGame();
    s.settings.schedule = Array(7).fill("ML");
    const first = s.days[s.startedOn];
    finish(first);
    first.answers[0].grade.score = 3;
    expect(retryQueue(s).map((d) => d.date)).toEqual([s.startedOn]);
    for (let i = 1; i <= 4; i++) {
      const d = addDays(s.startedOn, i);
      advance(s, noon(d), bank);
      expect(s.days[d].question!.id).not.toBe(first.question!.id);
      expect(s.days[d].retryOf).toBeUndefined();
    }
    const fifth = addDays(s.startedOn, 5);
    advance(s, noon(fifth), bank);
    expect(s.days[fifth]).toMatchObject({
      retryOf: s.startedOn,
      question: { id: first.question!.id },
    });
    // Still weak the second time: it does not come back a third time.
    finish(s.days[fifth]);
    s.days[fifth].answers[0].grade.score = 2;
    for (let i = 6; i <= 11; i++) {
      const d = addDays(s.startedOn, i);
      advance(s, noon(d), bank);
      expect(s.days[d].question!.id).not.toBe(first.question!.id);
    }
    expect(retryQueue(s)).toEqual([]);
    // A strong answer never comes back.
    const strong = addDays(s.startedOn, 1);
    finish(s.days[strong]);
    s.days[strong].answers[0].grade.score = 4;
    expect(retryQueue(s)).toEqual([]);
  });
  it("keeps the same assignment on repeated reads", () => {
    const s = game();
    const q = s.days[s.startedOn].question;
    advance(s, noon(s.startedOn), bank);
    expect(s.days[s.startedOn].question).toEqual(q);
  });
  it("generates grounded project probes without replacing an existing question", () => {
    // A one-question day from the weekly schedule, before days mixed categories.
    const s = game("2026-09-18"),
      first = s.days[s.startedOn];
    first.settings.questions = 1;
    delete first.settings.mix;
    Object.assign(first, { question: null, answers: [] });
    delete first.more;
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
          settings: {
            ...(s.settings as Required<Settings>),
            episodes: 1,
            study: DEFAULT_STUDY,
          },
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
describe("days from before BQ and the English task were retired", () => {
  it("still count the episodes those days asked for", () => {
    const s = game(),
      d = s.days[s.startedOn];
    Object.assign(d.settings, structuredClone(OLD_RULES));
    finish(d);
    for (const [watched, met] of [
      [0, false],
      [1, true],
      [2, true],
    ] as const) {
      d.episodes = watched;
      expect(requirements(d)).toMatchObject({ met, required: 4 });
    }
  });
  it("retires BQ and the English task from the next day; the open day keeps its work", () => {
    const s = oneQuestionGame();
    runDays(s, 2);
    // A camp saved before the change: one question, and BQ and the English task in the streak.
    delete s.settings.questions;
    Object.assign(s.settings, structuredClone(OLD_RULES));
    for (const d of Object.values(s.days)) {
      delete d.settings.questions;
      Object.assign(d.settings, structuredClone(OLD_RULES));
      d.bq = { questionId: "bq-01", stage: 1, text: "", practiced: false };
    }
    const [closed, open] = [s.startedOn, addDays(s.startedOn, 1)];
    Object.assign(s.days[closed], { episodes: 1 });
    Object.assign(s.days[closed].bq!, {
      text: "Situation, task, actions I personally took, and a measurable result.",
      completedAt: noon(closed),
    });
    advance(s, noon(open), bank);
    expect(s.settings).toMatchObject({
      questions: 3,
      episodes: 0,
      core: { bq: false, episodes: false, interview: true },
    });
    // The closed day keeps its own rules.
    expect(requirements(s.days[closed])).toMatchObject({
      met: true,
      required: 3,
    });
    // She already answered today: one question still, and no BQ or episode to finish.
    expect(interviewItems(s.days[open])).toHaveLength(1);
    expect(s.days[open].bq).toBeNull();
    expect(requirements(s.days[open])).toMatchObject({
      met: true,
      required: 1,
    });
    const next = addDays(open, 1);
    advance(s, noon(next), bank);
    expect(s.days[next].bq).toBeNull();
    expect(interviewItems(s.days[next])).toHaveLength(3);
    expect(requirements(s.days[next])).toMatchObject({ required: 3 });
  });
  it("gives an unanswered open day the extra questions", () => {
    const s = oneQuestionGame();
    delete s.settings.questions;
    delete s.days[s.startedOn].settings.questions;
    advance(s, noon(s.startedOn), bank);
    const items = interviewItems(s.days[s.startedOn]);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.question.id)).size).toBe(3);
  });
});
describe("three questions a day", () => {
  const answer = (date: string, slot?: number) => ({
    type: "answer" as const,
    id: crypto.randomUUID(),
    date,
    ...(slot !== undefined && { slot }),
    text: "A full explanation with examples",
  });
  it("asks one question from each of the day's categories and needs all three", () => {
    const s = game(),
      d = s.days[s.startedOn],
      items = interviewItems(d);
    // 2026-09-14 is a Monday.
    expect(items.map((item) => item.question.category)).toEqual([
      "ML",
      "AI/LLM",
      "SQL",
    ]);
    finish(d);
    expect(requirements(d)).toEqual({ completed: 3, required: 3, met: true });
    items[2].answers[0].grade.score = 2;
    expect(requirements(d)).toEqual({ completed: 2, required: 3, met: false });
  });
  it("does not repeat a question until the category runs out", () => {
    const s = game();
    s.settings.mix = Array(7).fill(["Python", "Python", "Python"]);
    const seen: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const date = addDays(s.startedOn, i);
      advance(s, noon(date), bank);
      seen.push(
        ...interviewItems(s.days[date]).map((item) => item.question.id),
      );
    }
    // Ten Python questions: no repeat before all ten were asked, then the cycle starts again.
    expect(new Set(seen.slice(0, 10)).size).toBe(10);
    expect(new Set(seen).size).toBe(10);
  });
  it("keeps attempts, limits and reviews per question", () => {
    const s = game(),
      date = s.startedOn,
      now = noon(date);
    const first = answer(date),
      second = answer(date, 1);
    applyAction(s, first, "player", "p", now, bank);
    // A question waiting for review does not hold up the others.
    applyAction(s, second, "player", "p", now, bank);
    const items = interviewItems(s.days[date]);
    expect(items.map((item) => item.answers.length)).toEqual([1, 1, 0]);
    applyGrade(s, date, second.id, {
      score: 4,
      missing: [],
      tip: "Good",
      model: "test",
      status: "graded",
    });
    expect(items[1].answers[0].grade.score).toBe(4);
    applyAction(
      s,
      {
        type: "override",
        id: crypto.randomUUID(),
        date,
        answerId: first.id,
        score: 3,
        reason: "Clear enough",
      },
      "referee",
      "r",
      now,
      bank,
    );
    expect(items[0].answers[0].override?.score).toBe(3);
    expect(() =>
      applyAction(s, answer(date, 3), "player", "p", now, bank),
    ).toThrow("找不到这道题");
  });
  it("brings a weak later question back on the next day with its category", () => {
    const s = game();
    const first = s.days[s.startedOn];
    finish(first);
    const items = interviewItems(first);
    items[0].answers[0].grade.score = 4;
    items[1].answers[0].grade.score = 2;
    items[2].answers[0].grade.score = 5;
    expect(retryQueue(s).map((r) => r.key)).toEqual([`${s.startedOn}#1`]);
    // The AI/LLM question is due from Saturday, which asks none, so it comes back on Sunday.
    const [saturday, sunday] = [5, 6].map((i) => addDays(s.startedOn, i));
    for (let i = 1; i <= 6; i++)
      advance(s, noon(addDays(s.startedOn, i)), bank);
    expect(interviewItems(s.days[saturday]).some((i) => i.retryOf)).toBe(false);
    const retry = interviewItems(s.days[sunday]).find((item) => item.retryOf);
    expect(retry).toMatchObject({
      retryOf: `${s.startedOn}#1`,
      question: { id: items[1].question.id },
    });
    expect(retrySource(s, retry!.retryOf!)).toBe(items[1]);
  });
});
describe("mixed categories", () => {
  const project = {
    id: crypto.randomUUID(),
    title: "Retention",
    summary: "Predict retention using events",
    role: "Model evaluation",
    methods: "LightGBM",
    metrics: "PR-AUC 0.4",
  };
  it("follows the weekly mix: three categories a day, a balanced week", () => {
    const s = game();
    s.projects = [project];
    const counts: Record<string, number> = {};
    for (let i = 1; i <= 7; i++) {
      const date = addDays(s.startedOn, i);
      advance(s, noon(date), bank);
      const categories = interviewItems(s.days[date]).map(
        (item) => item.question.category,
      );
      expect(new Set(categories).size).toBe(3);
      for (const c of categories) counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(counts).toEqual({
      ML: 7,
      "AI/LLM": 6,
      SQL: 4,
      Python: 2,
      Project: 2,
    });
  });
  it("asks ML in the project's place until there is a project", () => {
    const s = game("2026-09-17"); // Thursday: ML, AI/LLM, project
    expect(
      interviewItems(s.days[s.startedOn]).map((i) => i.question.category),
    ).toEqual(["ML", "AI/LLM", "ML"]);
    s.projects = [project];
    const saturday = addDays(s.startedOn, 2);
    advance(s, noon(saturday), bank);
    const items = interviewItems(s.days[saturday]);
    expect(items.map((i) => i.question.category)).toEqual([
      "ML",
      "Python",
      "Project",
    ]);
    expect(items[2].question.prompt).toContain("Retention");
  });
  it("switches older camps from the next day; an unanswered open day is re-picked", () => {
    const answered = game(),
      fresh = game();
    for (const s of [answered, fresh]) {
      delete s.settings.mix;
      delete s.days[s.startedOn].settings.mix;
    }
    finish(answered.days[answered.startedOn]);
    const before = interviewItems(answered.days[answered.startedOn]).map(
      (i) => i.question.id,
    );
    advance(answered, noon(answered.startedOn), bank);
    expect(answered.settings.mix).toEqual(DEFAULT_SETTINGS.mix);
    expect(
      interviewItems(answered.days[answered.startedOn]).map(
        (i) => i.question.id,
      ),
    ).toEqual(before);
    expect(answered.days[answered.startedOn].settings.mix).toBeUndefined();
    advance(fresh, noon(fresh.startedOn), bank);
    expect(fresh.days[fresh.startedOn].settings.mix).toEqual(
      DEFAULT_SETTINGS.mix,
    );
  });
});
describe("days off", () => {
  const excuse = (date: string, reason = "生病了") => ({
    type: "excuse" as const,
    id: crypto.randomUUID(),
    date,
    reason,
  });
  it("neither count nor break the streak, cost nothing, and only the referee gives them", () => {
    const s = game();
    runDays(s, 2);
    const [sick1, sick2, back] = [2, 3, 4].map((i) => addDays(s.startedOn, i));
    for (const d of [sick1, sick2, back]) advance(s, noon(d), bank);
    finish(s.days[back]);
    const now = noon(addDays(back, 1));
    const before = evaluate(s, now);
    expect(before.days.map((d) => d.status)).toEqual([
      "met",
      "met",
      "frozen",
      "missed",
      "met",
    ]);
    expect(before).toMatchObject({ streak: 1, pool: 10 });
    expect(() =>
      applyAction(s, excuse(sick1), "player", "p", now, bank),
    ).toThrow("权限");
    for (const d of [sick1, sick2])
      applyAction(s, excuse(d), "referee", "r", now, bank);
    const after = evaluate(s, now);
    // Acting opened the next day, which is still in progress.
    expect(after.days.map((d) => d.status)).toEqual([
      "met",
      "met",
      "excused",
      "excused",
      "met",
      "open",
    ]);
    expect(after).toMatchObject({
      streak: 3,
      points: 300,
      pool: 0,
      freezes: 1,
    });
    // A completed day stays a success; an empty reason takes the day off back.
    applyAction(s, excuse(back), "referee", "r", now, bank);
    expect(evaluate(s, now).days[4].status).toBe("met");
    // Back to counting: the freeze the first sick day no longer needs now covers it.
    applyAction(s, excuse(sick2, ""), "referee", "r", now, bank);
    expect(s.days[sick2].excused).toBeUndefined();
    expect(evaluate(s, now).days[3].status).toBe("frozen");
  });
});
