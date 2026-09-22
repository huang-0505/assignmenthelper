import data from "../../data/questions.json";
import {
  addDays,
  advance,
  closeTime,
  dayKey,
  DEFAULT_SETTINGS,
  evaluate,
  newGame,
} from "./engine";
import { applyAction, applyGrade, type Action } from "./actions";
import type { GameState, Question, Role, Snapshot } from "./types";
const bank = data as Question[];
const KEY = "offer-quest-demo-v1";
export const bqBank = bank.filter((q) => q.category === "BQ");
function seed(now: string): GameState {
  const today = dayKey(now, DEFAULT_SETTINGS),
    first = addDays(today, -6);
  const state = newGame(
    new Date(
      Date.parse(closeTime(first, DEFAULT_SETTINGS)) - 3600000,
    ).toISOString(),
    bank,
  );
  state.projects = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      title: "电商用户流失预测",
      summary:
        "Built a churn prediction pipeline for an e-commerce platform using customer activity and order histories.",
      role: "Owned feature engineering, model evaluation, and the monitoring prototype.",
      methods: "LightGBM, time-based validation, SHAP",
      metrics:
        "Demo example: PR-AUC 0.42 vs 0.28 baseline; intervention lift still needs an experiment.",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      title: "面向文档的 RAG 助手",
      summary:
        "Created a retrieval assistant to answer internal documentation questions with linked evidence and an abstention path.",
      role: "Designed retrieval evaluation and implemented hybrid search.",
      methods: "Hybrid retrieval, reranking, prompt evaluation",
      metrics:
        "Demo example: answer support rate 87% on 100 manually reviewed questions.",
    },
  ];
  for (let i = 0; i < 6; i++) {
    const date = addDays(first, i),
      at = new Date(
        Date.parse(closeTime(date, DEFAULT_SETTINGS)) - 3600000,
      ).toISOString();
    advance(state, at, bank);
    const day = state.days[date];
    day.applications = i % 2 ? 5 : 3;
    day.contacts = i % 2 ? 30 : 20;
    day.answers.push({
      id: crypto.randomUUID(),
      text: "Demo answer: I would start with a simple baseline, define the evaluation unit, and use a held-out dataset. I would inspect failure modes and report uncertainty before deciding whether to deploy.",
      submittedAt: at,
      grade: {
        score: 4,
        missing: ["可以更具体地描述一个失败场景"],
        tip: "补充一个真实的指标与取舍，让回答更有说服力。",
        model: "演示反馈",
        status: "graded",
      },
    });
    if (day.bq) {
      day.bq.text =
        "Situation: The team faced an ambiguous request. Task: I owned defining the measurement. Action: I interviewed stakeholders and built a baseline. Result: We agreed on a measurable next experiment.";
      day.bq.practiced = day.bq.stage === 2;
      day.bq.completedAt = at;
    }
  }
  advance(state, now, bank);
  state.days[today].applications = 2;
  state.days[today].contacts = 12;
  return state;
}
export function demoSnapshot(now = new Date().toISOString()): Snapshot {
  let state: GameState;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : seed(now);
    if (state.version !== 1) throw new Error();
  } catch {
    state = seed(now);
  }
  const today = advance(state, now, bank);
  localStorage.setItem(KEY, JSON.stringify(state));
  const role: Role =
    localStorage.getItem("offer-quest-demo-role") === "referee"
      ? "referee"
      : "player";
  return {
    mode: "demo",
    role,
    name: role === "player" ? "未来的数据科学家" : "首席加油官",
    state,
    today,
    summary: evaluate(state, now),
    serverTime: now,
  };
}
export function demoAction(action: Action): Snapshot {
  const snapshot = demoSnapshot(),
    now = new Date().toISOString();
  applyAction(snapshot.state, action, snapshot.role, "demo", now, bank);
  if (action.type === "answer")
    applyGrade(snapshot.state, action.date, action.id, {
      score: null,
      missing: [],
      tip: "演示模式不调用 AI。答案已保存，请切换裁判视角体验审核。",
      model: null,
      status: "pending",
    });
  localStorage.setItem(KEY, JSON.stringify(snapshot.state));
  return demoSnapshot(now);
}
