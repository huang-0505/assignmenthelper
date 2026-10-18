import { Temporal } from "@js-temporal/polyfill";
import { DEFAULT_STUDY, studyRewards, type StudyOutcome } from "./study";
import type {
  Answer,
  BqTask,
  Category,
  CoreTasks,
  Day,
  GameState,
  InterviewItem,
  Project,
  Question,
  Settings,
  Summary,
  TaskKey,
} from "./types";

/** Outreach is a numbers game that runs on a weekly rhythm; the streak asks for the interview questions. */
export const DEFAULT_CORE: CoreTasks = {
  applications: false,
  contacts: false,
  interview: true,
  bq: false,
  episodes: false,
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
  episodes: 0,
  questions: 3,
  bonusApplications: 5,
  bonusContacts: 30,
  basePoints: 100,
  bonusPoints: 25,
  penaltyAmount: 10,
  penaltyThreshold: 50,
  schedule: ["AI/LLM", "ML", "AI/LLM", "SQL", "ML", "Project", "Alternate"],
  // One ML, one AI/LLM and one hands-on question a day; Saturday swaps AI/LLM for a second hands-on
  // one. A week asks 7 ML, 6 AI/LLM, 4 SQL, 2 Python and 2 project questions, so every bank cycles
  // in about five weeks.
  mix: [
    ["ML", "AI/LLM", "SQL"],
    ["ML", "AI/LLM", "SQL"],
    ["ML", "AI/LLM", "Python"],
    ["ML", "AI/LLM", "SQL"],
    ["ML", "AI/LLM", "Project"],
    ["ML", "AI/LLM", "SQL"],
    ["ML", "Python", "Project"],
  ],
  rewards: [
    { streak: 7, text: "一顿想吃的饭，裁判请客！" },
    { streak: 14, text: "一起去一日游！" },
    { streak: 21, text: "秘密奖励（后面）" },
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
  return resolve(
    settings.schedule[Temporal.PlainDate.from(date).dayOfWeek % 7],
    date,
  );
}
/** The categories of the day's questions in order: the weekday's mix, or all from `schedule`. */
export function categoriesFor(date: string, settings: Settings): Category[] {
  const count = settings.questions ?? 1,
    row = settings.mix?.[Temporal.PlainDate.from(date).dayOfWeek % 7];
  return Array.from({ length: count }, (_, i) =>
    row?.length
      ? resolve(row[i % row.length], date)
      : categoryFor(date, settings),
  );
}
function resolve(category: Category | "Alternate", date: string): Category {
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
/** The day's interview questions in order. The first lives on the day itself, so older days read unchanged. */
export function interviewItems(day: Day): InterviewItem[] {
  return [
    ...(day.question
      ? [{ question: day.question, answers: day.answers, retryOf: day.retryOf }]
      : []),
    ...(day.more ?? []),
  ];
}
export function itemScore(item: InterviewItem): number | null {
  return finalScore(item.answers.at(-1));
}
const passed = (item: InterviewItem) => (itemScore(item) ?? 0) >= 3;
const awaitingReview = (item: InterviewItem) =>
  item.answers.length > 0 && itemScore(item) === null;
/** Every question of the day scored 3 or more. */
export function interviewDone(day: Day): boolean {
  const items = interviewItems(day);
  return items.length
    ? items.every(passed)
    : (finalScore(latestAnswer(day)) ?? 0) >= 3;
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
const probes = [
  [
    'In "{title}", you used {methods}. Why did you choose them? Compare two other approaches and explain which project requirement mattered most.',
    [
      "Link the choice to the project objective",
      "Compare two concrete alternatives",
      "Name data or operational constraints",
      "Discuss an experiment that could reverse the choice",
    ],
  ],
  [
    'In "{title}", your role was: {role}. Describe one decision you made yourself. What did teammates do, how did you check the result, and what would you change next time?',
    [
      "Separate personal ownership from team work",
      "Explain a concrete decision",
      "Describe validation and review",
      "Reflect on a tradeoff",
    ],
  ],
  [
    'For "{title}", you reported: {metrics}. How did you measure these results? What did you compare them with, and how would you check that the improvement came from your work?',
    [
      "Define metric, baseline, and denominator",
      "Explain measurement design",
      "Address confounding and uncertainty",
      "Connect impact to users or a business outcome",
    ],
  ],
  [
    'Your project is "{title}": {summary}. It works poorly for a new group of users. How would you find the cause, address the problem, and check whether the fix works?',
    [
      "Identify plausible distribution changes",
      "Slice errors by segment",
      "Propose a safe mitigation",
      "Define monitoring and rollback criteria",
    ],
  ],
  [
    'You need to rebuild "{title}" in half the original time. You previously used {methods}. What would you keep, simplify, or remove? Explain how you would check that the smaller version still meets the main goal.',
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
/** Earlier questions of one category, oldest first, each with the day it was asked. */
function askedBefore(state: GameState, date: string, category: Category) {
  return Object.values(state.days)
    .filter((d) => d.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) =>
      interviewItems(d).map((item) => ({ ...item, date: d.date })),
    )
    .filter((item) => item.question.category === category);
}
/** `count` different questions of one category for the day, skipping the ids in `skip`. */
export function selectQuestions(
  state: GameState,
  date: string,
  bank: Question[],
  category: Category,
  count = 1,
  skip: string[] = [],
): Question[] {
  const history = askedBefore(state, date, category);
  if (category === "Project") {
    const projects = state.projects;
    return Array.from({ length: projects.length ? count : 0 }, (_, i) =>
      projectQuestion(
        projects[(history.length + i) % projects.length],
        Math.floor((history.length + i) / projects.length),
      ),
    );
  }
  const pool = bank.filter((q) => q.category === category);
  if (!pool.length) throw new Error(`Missing question category: ${category}`);
  // Every assignment counts, including missed days. Reset only when the entire pool was assigned.
  const used = new Set<string>();
  for (const item of history) {
    used.add(item.question.id);
    if (pool.every((q) => used.has(q.id))) used.clear();
  }
  const last = new Map(history.map((item) => [item.question.id, item]));
  const priority = (item?: (typeof history)[number]) =>
    !item
      ? 0
      : (itemScore(item) ?? 0) < 3 && item.date <= addDays(date, -7)
        ? 1
        : 2;
  const picked: Question[] = [];
  const taken = new Set(skip);
  while (picked.length < count) {
    let candidates = pool.filter((q) => !used.has(q.id) && !taken.has(q.id));
    if (!candidates.length) {
      used.clear();
      candidates = pool.filter((q) => !taken.has(q.id));
      if (!candidates.length) break;
    }
    candidates.sort((a, b) => {
      const da = last.get(a.id),
        db = last.get(b.id);
      return (
        priority(da) - priority(db) ||
        (da?.date ?? "").localeCompare(db?.date ?? "") ||
        a.id.localeCompare(b.id)
      );
    });
    used.add(candidates[0].id);
    taken.add(candidates[0].id);
    picked.push(structuredClone(candidates[0]));
  }
  return picked;
}
export function selectQuestion(
  state: GameState,
  date: string,
  bank: Question[],
  settings: Settings,
): Question | null {
  return (
    selectQuestions(state, date, bank, categoryFor(date, settings))[0] ?? null
  );
}
export const RETRY_SCORE = 4,
  RETRY_DAYS = 5;
export type RetryItem = InterviewItem & {
  date: string;
  /** What `retryOf` points at: the date for a day's first question, `date#n` for the others. */
  key: string;
};
/**
 * Weak answers (below 4) that will come back: each once, on the next same-category day at least
 * five days later. A question that is itself a second try does not come back again.
 */
export function retryQueue(
  state: GameState,
  before = "9999-12-31",
): RetryItem[] {
  const items = Object.values(state.days)
    .filter((d) => d.date < before)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) =>
      interviewItems(d).map((item, i) => ({
        ...item,
        date: d.date,
        key: i ? `${d.date}#${i}` : d.date,
      })),
    );
  const retried = new Set(items.map((item) => item.retryOf));
  return items.filter((item) => {
    const score = itemScore(item);
    return (
      score !== null &&
      score < RETRY_SCORE &&
      !item.retryOf &&
      !retried.has(item.key)
    );
  });
}
/** Finds the earlier question a `retryOf` points at. */
export function retrySource(
  state: GameState,
  key: string,
): InterviewItem | undefined {
  const [date, slot = "0"] = key.split("#");
  const day = state.days[date];
  return day && interviewItems(day)[Number(slot)];
}
function interviewFor(
  state: GameState,
  date: string,
  bank: Question[],
  settings: Settings,
): InterviewItem[] {
  // A mixed day without any project yet asks another ML question in the project's place.
  const slots = categoriesFor(date, settings).map((category) =>
    category === "Project" && settings.mix && !state.projects.length
      ? "ML"
      : category,
  );
  const due = retryQueue(state, date).filter(
    (r) => r.date <= addDays(date, -RETRY_DAYS),
  );
  const byCategory = new Map<Category, InterviewItem[]>();
  for (const category of new Set(slots)) {
    const count = slots.filter((c) => c === category).length;
    const retries =
      category === "Project"
        ? []
        : due.filter((r) => r.question.category === category).slice(0, count);
    const fresh = selectQuestions(
      state,
      date,
      bank,
      category,
      count - retries.length,
      retries.map((r) => r.question.id),
    );
    byCategory.set(category, [
      ...retries.map((r) => ({
        question: structuredClone(r.question),
        answers: [],
        retryOf: r.key,
      })),
      ...fresh.map((question) => ({ question, answers: [] })),
    ]);
  }
  return slots.flatMap((category) => byCategory.get(category)!.shift() ?? []);
}
/** Puts the questions on the day: the first in the original fields, the rest in `more`. */
function setInterview(day: Day, items: InterviewItem[]) {
  const [first, ...rest] = items;
  day.question = first?.question ?? null;
  day.answers = first?.answers ?? [];
  if (first?.retryOf) day.retryOf = first.retryOf;
  else delete day.retryOf;
  if (rest.length) day.more = rest;
  else delete day.more;
}
function createDay(
  state: GameState,
  date: string,
  bank: Question[],
  settings: Settings,
): Day {
  const day: Day = {
    date,
    closesAt: closeTime(date, settings),
    settings: structuredClone(settings),
    applications: 0,
    contacts: 0,
    episodes: 0,
    logs: [],
    answers: [],
    question: null,
    bq: null,
  };
  setInterview(day, interviewFor(state, date, bank, settings));
  return day;
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
  // Refresh the former default wording in saved rewards, including earned milestones.
  for (const settings of [
    state.settings,
    state.nextSettings,
    ...Object.values(state.days).map((day) => day.settings),
  ]) {
    for (const reward of settings?.rewards ?? []) {
      if (reward.streak === 21 && reward.text === "一份裁判用心挑的小礼物！")
        reward.text = "秘密奖励（后面）";
    }
  }
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
  // BQ and the English task were retired and the interview grew to several questions. The day
  // still open keeps what she has done: it loses the retired tasks from the streak, and gets the
  // extra questions only if she has not answered yet.
  if (state.settings.questions === undefined) {
    const retire = (settings: Settings) => {
      settings.questions = DEFAULT_SETTINGS.questions;
      settings.episodes = 0;
      settings.core = { ...coreOf(settings), bq: false, episodes: false };
    };
    retire(state.settings);
    if (state.nextSettings) retire(state.nextSettings);
    if (Temporal.Instant.compare(now, day.closesAt) < 0) {
      day.settings.core = {
        ...coreOf(day.settings),
        bq: false,
        episodes: false,
      };
      if (day.bq && !day.bq.completedAt) day.bq = null;
      if (!day.episodes) day.settings.episodes = 0;
      if (!interviewItems(day).some((item) => item.answers.length)) {
        retire(day.settings);
        setInterview(day, interviewFor(state, day.date, bank, day.settings));
      }
    }
  }
  // Then each day mixed categories instead of asking one. Same again: from the next day, and the
  // open day only if she has not answered yet.
  if (state.settings.mix === undefined) {
    for (const settings of [state.settings, state.nextSettings])
      if (settings) settings.mix = structuredClone(DEFAULT_SETTINGS.mix);
    if (
      Temporal.Instant.compare(now, day.closesAt) < 0 &&
      !interviewItems(day).some((item) => item.answers.length)
    ) {
      day.settings.mix = structuredClone(DEFAULT_SETTINGS.mix);
      setInterview(day, interviewFor(state, day.date, bank, day.settings));
    }
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
  // Update wording only before the first answer; answered questions keep their original text.
  for (const { question: current, answers } of interviewItems(day)) {
    if (answers.length) continue;
    const updated = bank.find((question) => question.id === current.id);
    if (
      updated &&
      updated.category === current.category &&
      updated.difficulty === current.difficulty &&
      updated.expectedQuery === current.expectedQuery &&
      JSON.stringify(updated.rubric) === JSON.stringify(current.rubric)
    )
      current.prompt = updated.prompt;
  }
  // Adding the first project unlocks today's stable questions, without changing existing questions.
  if (
    !day.question &&
    state.projects.length &&
    categoriesFor(day.date, day.settings).includes("Project")
  ) {
    setInterview(day, interviewFor(state, day.date, bank, day.settings));
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
    { key: "interview", done: interviewDone(day) },
  ];
  if (day.bq) tasks.push({ key: "bq", done: bqDone(day.bq) });
  if (s.episodes) tasks.push({ key: "episodes", done: episodesDone(day) });
  return tasks.map((t) => ({ ...t, core: core[t.key] }));
}
export function requirements(day: Day) {
  // Each interview question counts as its own step, so progress reads 2 / 3 rather than 0 / 1.
  const questions = interviewItems(day).map(passed);
  const checks = dayTasks(day)
    .filter((t) => t.core)
    .flatMap((t) =>
      t.key === "interview" && questions.length ? questions : [t.done],
    );
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
      items = interviewItems(day),
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
      } else if (day.excused) {
        // A day off: no points, no penalty, no freeze, and the streak carries on past it.
        status = "excused";
      } else if (closed) {
        // Only defer a penalty when a review can actually change this day's outcome.
        const otherMet = dayTasks(day)
          .filter((t) => t.core && t.key !== "interview")
          .every((t) => t.done);
        if (
          items.some(awaitingReview) &&
          items.every((item) => passed(item) || awaitingReview(item)) &&
          otherMet
        ) {
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
