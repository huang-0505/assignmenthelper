import { z } from "zod";
import {
  advance,
  bqDone,
  completedBq,
  evaluate,
  latestAnswer,
  weekKey,
} from "./engine";
import type { GameState, Grade, Question, Role } from "./types";

// Shared by browser forms and server routes so validation feedback stays in Chinese.
z.config(z.locales.zhCN());

const short = z.string().trim().max(200);
const settingsSchema = z
  .object({
    timezone: z.literal("America/New_York"),
    closeHour: z.number().int().min(0).max(23),
    applications: z.number().int().min(1).max(100),
    contacts: z.number().int().min(1).max(1000),
    bonusApplications: z.number().int().min(1).max(100),
    bonusContacts: z.number().int().min(1).max(1000),
    basePoints: z.number().int().min(1).max(1000),
    bonusPoints: z.number().int().min(0).max(1000),
    penaltyAmount: z.number().int().min(1).max(1000),
    penaltyThreshold: z.number().int().min(1).max(10000),
    schedule: z
      .array(z.enum(["ML", "AI/LLM", "SQL", "Python", "Project", "Alternate"]))
      .length(7),
    rewards: z
      .array(
        z.object({
          streak: z.number().int().min(1).max(365),
          text: short.min(1),
        }),
      )
      .min(1)
      .max(10),
  })
  .refine(
    (s) =>
      s.bonusApplications >= s.applications && s.bonusContacts >= s.contacts,
    "加分门槛不能小于每日最低要求",
  )
  .refine(
    (s) => new Set(s.rewards.map((r) => r.streak)).size === s.rewards.length,
    "里程碑天数不能重复",
  );
const id = z.string().uuid();
const common = { id, date: z.iso.date() };
export const nameSchema = z.string().trim().min(1, "请输入名字").max(40);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    ...common,
    type: z.literal("log"),
    kind: z.enum(["application", "contact"]),
    count: z.number().int().min(1).max(1000),
    company: short,
    link: z.union([
      z.literal(""),
      z
        .url()
        .max(1000)
        .refine((v) => /^https?:\/\//.test(v), "仅支持 http 或 https 链接"),
    ]),
  }),
  z.object({ ...common, type: z.literal("removeLog"), logId: id }),
  z.object({
    ...common,
    type: z.literal("answer"),
    text: z.string().trim().min(20).max(16000),
  }),
  z.object({
    ...common,
    type: z.literal("bq"),
    text: z.string().trim().max(16000),
    practiced: z.boolean(),
  }),
  z.object({
    ...common,
    type: z.literal("retell"),
    questionId: short.min(1),
    text: z.string().trim().max(16000),
    practiced: z.literal(true),
  }),
  z.object({
    id,
    type: z.literal("project"),
    project: z.object({
      id,
      title: short.min(2),
      summary: z.string().trim().min(20).max(2000),
      role: z.string().trim().min(5).max(1000),
      methods: z.string().trim().min(3).max(1000),
      metrics: z.string().trim().min(3).max(1000),
    }),
  }),
  z.object({ id, type: z.literal("settings"), settings: settingsSchema }),
  z.object({
    ...common,
    type: z.literal("override"),
    answerId: id,
    score: z.number().int().min(1).max(5),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({ id, type: z.literal("redeem") }),
  z.object({ id, type: z.literal("playerName"), name: nameSchema }),
]);
export type Action = z.infer<typeof actionSchema>;

const normalizeName = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function sameName(a: string, b: string) {
  return normalizeName(a) === normalizeName(b);
}
/** The first entered name becomes the player; afterwards only that name can enter. */
export function claimPlayer(state: GameState, name: string) {
  if (!state.playerName) state.playerName = name;
  else if (!sameName(state.playerName, name))
    throw new Error("这个训练营已经有玩家了，请输入玩家本人的名字");
  return state.playerName;
}
export function applyAction(
  state: GameState,
  action: Action,
  role: Role,
  actor: string,
  now: string,
  bank: Question[],
) {
  const refereeAction = [
    "settings",
    "override",
    "redeem",
    "playerName",
  ].includes(action.type);
  if (refereeAction !== (role === "referee"))
    throw new Error("你的角色没有这项操作的权限");
  if (state.audit.some((a) => a.id === action.id)) return;
  const today = advance(state, now, bank);
  if ("date" in action && action.type !== "override" && action.date !== today)
    throw new Error("这一天已经结束，请刷新后记录今天的进度");
  const day = "date" in action ? state.days[action.date] : state.days[today];
  if (!day) throw new Error("找不到这一天的记录");
  switch (action.type) {
    case "log": {
      const field = action.kind === "application" ? "applications" : "contacts";
      if (day[field] + action.count > 10000)
        throw new Error("每日记录数量不能超过 10000");
      day.logs.push({
        id: action.id,
        kind: action.kind,
        count: action.count,
        company: action.company,
        link: action.link,
        at: now,
      });
      day[field] += action.count;
      break;
    }
    case "removeLog": {
      const log = day.logs.find((l) => l.id === action.logId);
      if (!log) throw new Error("找不到这条记录");
      day[log.kind === "application" ? "applications" : "contacts"] -=
        log.count;
      day.logs = day.logs.filter((l) => l.id !== log.id);
      break;
    }
    case "answer": {
      if (!day.question) throw new Error("请先录入项目，再开始今天的项目追问");
      if (day.answers.length >= 5)
        throw new Error("今天已提交 5 次，请让裁判审核现有答案");
      if (
        latestAnswer(day)?.grade.status === "pending" &&
        !latestAnswer(day)?.override
      )
        throw new Error("上次答案正在等待裁判审核，请先完成审核");
      day.answers.push({
        id: action.id,
        text: action.text,
        submittedAt: now,
        grade: {
          score: null,
          missing: [],
          tip: "正在等待评分；若服务中断，裁判可以直接审核。",
          model: null,
          status: "pending",
        },
      });
      break;
    }
    case "bq": {
      if (!day.bq) throw new Error("你已完成全部 BQ，可以进行每周复述");
      if (day.bq.stage === 1 && action.text.length < 40)
        throw new Error("STAR 草稿至少需要 40 个字符");
      if (day.bq.stage === 2 && !action.practiced)
        throw new Error("请先完成口述练习并勾选确认");
      day.bq.text = action.text;
      day.bq.practiced = action.practiced;
      day.bq.completedAt = now;
      break;
    }
    case "retell": {
      const completed = completedBq(state, today);
      if (
        [...completed.values()].filter((p) => p.practice).length !== 12 ||
        !completed.get(action.questionId)?.practice
      )
        throw new Error("完成全部 12 道 BQ 后才能获得复述奖励");
      if (
        Object.values(state.days).some(
          (d) => d.retell?.practiced && weekKey(d.date) === weekKey(today),
        )
      )
        throw new Error("本周已记录一次复述");
      day.retell = {
        questionId: action.questionId,
        text: action.text,
        practiced: true,
      };
      break;
    }
    case "project": {
      const index = state.projects.findIndex((p) => p.id === action.project.id);
      if (index < 0 && state.projects.length >= 3)
        throw new Error("最多录入 3 个项目，请编辑已有项目");
      if (index < 0) state.projects.push(action.project);
      else state.projects[index] = action.project;
      advance(state, now, bank);
      break;
    }
    case "settings":
      state.nextSettings = action.settings;
      break;
    case "override": {
      const answer = day.answers.find((a) => a.id === action.answerId);
      if (!answer) throw new Error("找不到需要审核的答案");
      answer.override = {
        score: action.score,
        reason: action.reason,
        at: now,
        by: actor,
      };
      break;
    }
    case "redeem": {
      const summary = evaluate(state, now);
      if (summary.days.some((d) => d.status === "pending"))
        throw new Error("请先处理待审核日期，再兑换罚金池");
      if (summary.pool < state.settings.penaltyThreshold)
        throw new Error("罚金池尚未达到兑换门槛");
      state.redemptions.push({ id: action.id, at: now, amount: summary.pool });
      break;
    }
    case "playerName":
      state.playerName = action.name;
      break;
  }
  state.audit.push({
    id: action.id,
    at: now,
    actor,
    action: action.type,
    date: "date" in action ? action.date : undefined,
    detail:
      action.type === "override"
        ? `${action.score}/5: ${action.reason}`
        : action.type === "settings"
          ? "设置于下一训练日生效"
          : action.type === "redeem"
            ? "裁判确认已请客，清空已累计罚金"
            : action.type === "playerName"
              ? `玩家名字改为「${action.name}」`
              : "已保存",
  });
}

export function applyGrade(
  state: GameState,
  date: string,
  answerId: string,
  grade: Grade,
) {
  const answer = state.days[date]?.answers.find((a) => a.id === answerId);
  if (!answer) throw new Error("找不到已保存的答案");
  // An AI response arriving after a referee decision never removes the referee's override.
  if (answer.grade.status === "pending") answer.grade = grade;
}

export function taskHint(state: GameState, date: string) {
  const day = state.days[date];
  return day.bq && bqDone(day.bq) ? "今日 BQ 已完成" : "每次练习都在积累";
}
