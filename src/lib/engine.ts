import { Temporal } from "@js-temporal/polyfill";
import { DEFAULT_STUDY, studyRewards, type StudyOutcome } from "./study";
import type {
  Answer,
  BqTask,
  Category,
  CoreTasks,
  Day,
  GameState,
  Project,
  Question,
  Settings,
  Summary,
  TaskKey,
} from "./types";

/** Outreach is a numbers game that runs on a weekly rhythm; the streak asks for the study tasks. */
export const DEFAULT_CORE: CoreTasks = {
  applications: false,
  contacts: false,
  interview: true,
  bq: true,
  episodes: true,
};
const ALL_CORE: CoreTasks = {
  applications: true,
  contacts: true,
  interview: true,
  bq: true,
  episodes: true,
};
/** Snapshots from before the split required every task. */
export const coreOf = (settings: Settings): CoreTasks =>
  settings.core ?? ALL_CORE;
export const DEFAULT_SETTINGS: Settings = {
  timezone: "America/New_York",
  closeHour: 0,
  applications: 3,
  contacts: 20,
  core: DEFAULT_CORE,
  weeklyApplications: 15,
  weeklyContacts: 100,
  episodes: 1,
  bonusApplications: 5,
  bonusContacts: 30,
  basePoints: 100,
  bonusPoints: 25,
  penaltyAmount: 10,
  penaltyThreshold: 50,
  schedule: ["AI/LLM", "ML", "AI/LLM", "SQL", "ML", "Project", "Alternate"],
  rewards: [
    { streak: 7, text: "一顿想吃的饭，裁判请客！" },
    { streak: 14, text: "一起去一日游！" },
    { streak: 21, text: "一份裁判用心挑的小礼物！" },
  ],
  study: DEFAULT_STUDY,
};

export function addDays(date: string, n: number) {
  return Temporal.PlainDate.from(date).add({ days: n }).toString();
}
export function dayKey(now: string, settings: Settings): string {
  const local = Temporal.Instant.from(now).toZonedDateTimeISO(
    settings.timezone,
  );
  return local
    .toPlainDate()
    .subtract({ days: local.hour < settings.closeHour ? 1 : 0 })
    .toString();
}
export function closeTime(date: string, settings: Settings): string {
  return Temporal.PlainDate.from(date)
    .add({ days: 1 })
    .toZonedDateTime({
      timeZone: settings.timezone,
      plainTime: `${String(settings.closeHour).padStart(2, "0")}:00`,
    })
    .toInstant()
    .toString();
}
export function weekKey(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}
export function categoryFor(date: string, settings: Settings): Category {
  const weekday = Temporal.PlainDate.from(date).dayOfWeek % 7;
  const category = settings.schedule[weekday];
  if (category !== "Alternate") return category;
  const weeks = Math.floor(
    Temporal.PlainDate.from("2026-01-05").until(
      Temporal.PlainDate.from(weekKey(date)),
    ).days / 7,
  );
  return Math.abs(weeks % 2) === 0 ? "SQL" : "Python";
}
export function finalScore(answer?: Answer): number | null {
  return answer?.override?.score ?? answer?.grade.score ?? null;
}
export function latestAnswer(day: Day): Answer | undefined {
  return day.answers.at(-1);
}
export function bqDone(bq: BqTask | null): boolean {
  return (
    !bq ||
    Boolean(
      bq.completedAt &&
      (bq.stage === 1 ? bq.text.trim().length >= 40 : bq.practiced),
    )
  );
}
export function completedBq(
  state: GameState,
  before = "9999-12-31",
): Map<string, { draft?: Day; practice?: Day }> {
  const progress = new Map<string, { draft?: Day; practice?: Day }>();
  for (const day of Object.values(state.days).sort((a, b) =>
    a.date.localeCompare(b.date),
  )) {
    if (day.date >= before || !day.bq || !bqDone(day.bq)) continue;
    const p = progress.get(day.bq.questionId) ?? {};
    if (day.bq.stage === 1) p.draft ??= day;
    else if (p.draft && p.draft.date < day.date) p.practice ??= day;
    progress.set(day.bq.questionId, p);
  }
  return progress;
}
export function nextBq(
  state: GameState,
  date: string,
  bank: Question[],
): BqTask | null {
  const progress = completedBq(state, date);
  for (const q of bank.filter((q) => q.category === "BQ")) {
    const p = progress.get(q.id);
    if (p?.practice) continue;
    return {
      questionId: q.id,
      stage: p?.draft ? 2 : 1,
      text: p?.draft?.bq?.text ?? "",
      practiced: false,
    };
  }
  return null;
}

const probes = [
  [
    'Why did you choose {methods} for "{title}"? Compare it with two plausible alternatives and explain which constraint changed your decision.',
    [
      "Link the choice to the project objective",
      "Compare two concrete alternatives",
      "Name data or operational constraints",
      "Discuss an experiment that could reverse the choice",
    ],
  ],
  [
    'In "{title}", your role was: {role}. Walk through one decision you personally owned, what others contributed, and how you verified your work.',
    [
      "Separate personal ownership from team work",
      "Explain a concrete decision",
      "Describe validation and review",
      "Reflect on a tradeoff",
    ],
  ],
  [
    'For "{title}", you reported: {metrics}. How was impact measured, and how would you rule out a misleading improvement?',
    [
      "Define metric, baseline, and denominator",
      "Explain measurement design",
      "Address confounding and uncertainty",
      "Connect impact to users or a business outcome",
    ],
  ],
  [
    'Imagine "{title}" fails for a new user segment. Using your project context ({summary}), explain your diagnosis, mitigation, and monitoring plan.',
    [
      "Identify plausible distribution changes",
      "Slice errors by segment",
      "Propose a safe mitigation",
      "Define monitoring and rollback criteria",
    ],
  ],
  [
    'If you rebuilt "{title}" with half the time, what would you change about {methods}, what would you keep, and what evidence supports that prioritization?',
    [
      "Identify the highest value component",
      "Describe a simpler baseline",
      "Explain quality versus delivery tradeoffs",
      "Propose a measurable next experiment",
    ],
  ],
] as const;
export function projectQuestion(project: Project, sequence: number): Question {
  const probe = probes[sequence % probes.length];
  const prompt = probe[0].replace(
    /\{(title|methods|role|metrics|summary)\}/g,
    (_, key: keyof Project) => project[key],
  );
  return {
    id: `project-${project.id}-${sequence}`,
    category: "Project",
    difficulty: "Hard",
    prompt,
    rubric: [...probe[1]],
  };
}
export function selectQuestion(
  state: GameState,
  date: string,
  bank: Question[],
  settings: Settings,
): Question | null {
  const category = categoryFor(date, settings);
  const history = Object.values(state.days)
    .filter((d) => d.date < date && d.question?.category === category)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (category === "Project") {
    if (!state.projects.length) return null;
    return projectQuestion(
      state.projects[history.length % state.projects.length],
      Math.floor(history.length / state.projects.length),
    );
  }
  const pool = bank.filter((q) => q.category === category);
  if (!pool.length) throw new Error(`Missing question category: ${category}`);
  // Every assignment counts, including missed days. Reset only when the entire pool was assigned.
  const used = new Set<string>();
  for (const d of history) {
    used.add(d.question!.id);
    if (pool.every((q) => used.has(q.id))) used.clear();
  }
  const last = new Map(history.map((d) => [d.question!.id, d]));
  const candidates = pool.filter((q) => !used.has(q.id));
  candidates.sort((a, b) => {
    const da = last.get(a.id),
      db = last.get(b.id);
    const priority = (d?: Day) =>
      !d
        ? 0
        : (finalScore(latestAnswer(d)) ?? 0) < 3 && d.date <= addDays(date, -7)
          ? 1
          : 2;
    return (
      priority(da) - priority(db) ||
      (da?.date ?? "").localeCompare(db?.date ?? "") ||
      a.id.localeCompare(b.id)
    );
  });
  return structuredClone(candidates[0]);
}
export const RETRY_SCORE = 4,
  RETRY_DAYS = 5;
/**
 * Weak answers (below 4) that will come back: each once, on the next same-category day at least
 * five days later. A day that is itself a second try does not come back again.
 */
export function retryQueue(state: GameState, before = "9999-12-31"): Day[] {
  const days = Object.values(state.days)
    .filter((d) => d.date < before && d.question)
    .sort((a, b) => a.date.localeCompare(b.date));
  const retried = new Set(days.map((d) => d.retryOf));
  return days.filter((d) => {
    const score = finalScore(latestAnswer(d));
    return (
      score !== null &&
      score < RETRY_SCORE &&
      !d.retryOf &&
      !retried.has(d.date)
    );
  });
}
function retryDue(state: GameState, date: string, category: Category) {
  return retryQueue(state, date).find(
    (d) =>
      d.question!.category === category && d.date <= addDays(date, -RETRY_DAYS),
  );
}
function createDay(
  state: GameState,
  date: string,
  bank: Question[],
  settings: Settings,
): Day {
  const category = categoryFor(date, settings);
  const retry =
    category === "Project" ? undefined : retryDue(state, date, category);
  return {
    date,
    closesAt: closeTime(date, settings),
    settings: structuredClone(settings),
    applications: 0,
    contacts: 0,
    episodes: 0,
    logs: [],
    answers: [],
    question: retry
      ? structuredClone(retry.question)
      : selectQuestion(state, date, bank, settings),
    ...(retry && { retryOf: retry.date }),
    bq: nextBq(state, date, bank),
  };
}
export function newGame(now: string, bank: Question[]): GameState {
  const settings = structuredClone(DEFAULT_SETTINGS),
    date = dayKey(now, settings);
  const state: GameState = {
    version: 1,
    startedOn: date,
    settings,
    days: {},
    projects: [],
    redemptions: [],
    audit: [],
  };
  state.days[date] = createDay(state, date, bank, settings);
  return state;
}
/** Mutates only the loaded copy. The repository commits using atomic compare-and-swap. */
export function advance(
  state: GameState,
  now: string,
  bank: Question[],
): string {
  let day = Object.values(state.days).sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  // Camps saved before the episode task existed get it from the day still open; closed days keep their rules.
  if (state.settings.episodes === undefined) {
    state.settings.episodes = DEFAULT_SETTINGS.episodes;
    if (state.nextSettings)
      state.nextSettings.episodes ??= state.settings.episodes;
    if (Temporal.Instant.compare(now, day.closesAt) < 0) {
      day.settings.episodes = state.settings.episodes;
      day.episodes ??= 0;
    }
  }
  if (state.settings.study === undefined) {
    state.settings.study = structuredClone(DEFAULT_STUDY);
    if (state.nextSettings)
      state.nextSettings.study ??= structuredClone(DEFAULT_STUDY);
    if (Temporal.Instant.compare(now, day.closesAt) < 0)
      day.settings.study = structuredClone(DEFAULT_STUDY);
  }
  // The core / bonus split arrives the same way: from the day still open, never retroactively.
  if (state.settings.core === undefined) {
    const split = {
      core: structuredClone(DEFAULT_CORE),
      weeklyApplications: DEFAULT_SETTINGS.weeklyApplications,
      weeklyContacts: DEFAULT_SETTINGS.weeklyContacts,
    };
    Object.assign(state.settings, split);
    if (state.nextSettings && state.nextSettings.core === undefined)
      Object.assign(state.nextSettings, structuredClone(split));
    if (Temporal.Instant.compare(now, day.closesAt) < 0)
      Object.assign(day.settings, structuredClone(split));
  }
  let count = 0;
  while (Temporal.Instant.compare(now, day.closesAt) >= 0) {
    if (++count > 3660) throw new Error("超过十年的数据需要管理员迁移");
    if (state.nextSettings) {
      state.settings = state.nextSettings;
      delete state.nextSettings;
    }
    const date = addDays(day.date, 1);
    state.days[date] = createDay(state, date, bank, state.settings);
    day = state.days[date];
  }
  // Adding the first project unlocks today's stable question, without changing existing questions.
  if (
    !day.question &&
    categoryFor(day.date, day.settings) === "Project" &&
    state.projects.length
  ) {
    day.question = selectQuestion(state, day.date, bank, day.settings);
  }
  return day.date;
}
/** The episode task asks for the target; watching more neither helps nor hurts. */
export function episodesDone(day: Day) {
  const target = day.settings.episodes ?? 0;
  return !target || (day.episodes ?? 0) >= target;
}
/** Every task the day has, with whether it is done and whether the streak needs it. */
export function dayTasks(
  day: Day,
): { key: TaskKey; done: boolean; core: boolean }[] {
  const s = day.settings,
    core = coreOf(s);
  const tasks: { key: TaskKey; done: boolean }[] = [
    { key: "applications", done: day.applications >= s.applications },
    { key: "contacts", done: day.contacts >= s.contacts },
    { key: "interview", done: (finalScore(latestAnswer(day)) ?? 0) >= 3 },
  ];
  if (day.bq) tasks.push({ key: "bq", done: bqDone(day.bq) });
  if (s.episodes) tasks.push({ key: "episodes", done: episodesDone(day) });
  return tasks.map((t) => ({ ...t, core: core[t.key] }));
}
export function requirements(day: Day) {
  const checks = dayTasks(day)
    .filter((t) => t.core)
    .map((t) => t.done);
  return {
    completed: checks.filter(Boolean).length,
    required: checks.length,
    met: checks.every(Boolean),
  };
}
/** Outreach so far this week up to and including `date`. */
export function weekTotals(state: GameState, date: string) {
  const week = weekKey(date);
  let applications = 0,
    contacts = 0;
  for (const d of Object.values(state.days))
    if (d.date <= date && weekKey(d.date) === week) {
      applications += d.applications;
      contacts += d.contacts;
    }
  return { applications, contacts };
}
export function evaluate(
  state: GameState,
  now: string,
  study: StudyOutcome[] = [],
): Summary {
  const sessionsByDay = new Map<string, StudyOutcome[]>();
  for (const o of study)
    sessionsByDay.set(o.day, [...(sessionsByDay.get(o.day) ?? []), o]);
  let streak = 0,
    bestStreak = 0,
    points = 0,
    freezes = 0,
    penalties = 0,
    lastWeek = "",
    blocked = false;
  const rewards: Summary["rewards"] = [],
    days: Summary["days"] = [];
  const retellWeeks = new Set<string>();
  // Weekly outreach targets pay once, on the day the week's total reaches them.
  const week = { applications: 0, contacts: 0, paid: new Set<string>() };
  for (const day of Object.values(state.days).sort((a, b) =>
    a.date.localeCompare(b.date),
  )) {
    const weekOf = weekKey(day.date),
      closed = Temporal.Instant.compare(now, day.closesAt) >= 0;
    const req = requirements(day),
      answer = latestAnswer(day),
      sessions = sessionsByDay.get(day.date) ?? [],
      studied = studyRewards(sessions),
      studyPenalty = sessions
        .filter((o) => o.failed)
        .reduce((sum, o) => sum + o.penalty, 0);
    let status: Summary["days"][number]["status"] = "open",
      earned = 0,
      penalty = 0;
    if (blocked) status = "waiting";
    else {
      if (weekOf !== lastWeek) {
        freezes = Math.min(2, freezes + 1);
        lastWeek = weekOf;
        week.applications = week.contacts = 0;
        week.paid.clear();
      }
      week.applications += day.applications;
      week.contacts += day.contacts;
      let weekly = 0;
      for (const [key, target] of [
        ["applications", day.settings.weeklyApplications ?? 0],
        ["contacts", day.settings.weeklyContacts ?? 0],
      ] as const)
        if (target > 0 && week[key] >= target && !week.paid.has(key)) {
          week.paid.add(key);
          weekly += day.settings.bonusPoints;
        }
      earned = weekly;
      if (req.met) {
        const bonus =
          Number(day.applications >= day.settings.bonusApplications) +
          Number(day.contacts >= day.settings.bonusContacts);
        const retell =
          day.retell?.practiced &&
          !retellWeeks.has(weekOf) &&
          completedBq(state, day.date).size === 12 &&
          [...completedBq(state, day.date).values()].every((p) => p.practice);
        if (retell) retellWeeks.add(weekOf);
        // Replay duration-tier rewards only when the daily minimum is met.
        earned +=
          day.settings.basePoints +
          (bonus + Number(Boolean(retell))) * day.settings.bonusPoints +
          studied.reduce((sum, o) => sum + o.points, 0);
        status = bonus || retell || studied.length || weekly ? "gold" : "met";
        streak += 1;
        for (const reward of day.settings.rewards) {
          if (
            streak === reward.streak &&
            !rewards.some((r) => r.streak === reward.streak)
          )
            rewards.push({
              ...reward,
              id: `${day.date}-${reward.streak}`,
              date: day.date,
            });
        }
      } else if (closed) {
        // Only defer a penalty when a review can actually change this day's outcome.
        const otherMet = dayTasks(day)
          .filter((t) => t.core && t.key !== "interview")
          .every((t) => t.done);
        if (answer && finalScore(answer) === null && otherMet) {
          status = "pending";
          blocked = true;
        } else if (freezes > 0) {
          freezes--;
          status = "frozen";
        } else {
          streak = 0;
          penalty = day.settings.penaltyAmount;
          status = "missed";
        }
      }
    }
    // A failed session costs its penalty whether or not the day itself is settled yet.
    penalty += studyPenalty;
    points += earned;
    penalties += penalty;
    bestStreak = Math.max(bestStreak, streak);
    days.push({
      date: day.date,
      status,
      points: earned,
      streak,
      freezes,
      penalty,
      ...req,
      study: {
        passed: sessions.filter((o) => o.passed).length,
        failed: sessions.filter((o) => o.failed).length,
      },
    });
  }
  return {
    days,
    streak,
    bestStreak,
    points,
    freezes,
    pool: Math.max(
      0,
      penalties - state.redemptions.reduce((sum, r) => sum + r.amount, 0),
    ),
    rewards,
    bqCompleted: [...completedBq(state).values()].filter((p) => p.practice)
      .length,
  };
}
