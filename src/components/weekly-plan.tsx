"use client";
import { useState } from "react";
import { CalendarDays, Send } from "lucide-react";
import { addDays, weekKey } from "@/lib/engine";
import type { WeeklyPlan } from "@/lib/types";
import { useGame } from "./provider";

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const range = (week: string) =>
  `${week.slice(5).replace("-", "/")} — ${addDays(week, 6).slice(5).replace("-", "/")}`;

export function WeeklyPlanCard() {
  const { snapshot } = useGame();
  const week = weekKey(snapshot.today),
    plans = snapshot.state.weeklyPlans;
  const current = plans?.[week],
    next = plans?.[addDays(week, 7)];
  if (!current && !next) return null;
  const show = (p: WeeklyPlan) => (
    <>
      <h3>{p.goal}</h3>
      <div className="plan-priorities">
        {p.outreach && (
          <p>
            <b>投递与 Networking</b>
            {p.outreach}
          </p>
        )}
        {p.focus && (
          <p>
            <b>学习重点</b>
            {p.focus}
          </p>
        )}
      </div>
      {p.weekOf === week &&
        p.days[
          Number((Date.parse(snapshot.today) - Date.parse(week)) / 86400000)
        ] && (
          <p className="plan-today">
            <b>今天的安排</b>
            {
              p.days[
                Number(
                  (Date.parse(snapshot.today) - Date.parse(week)) / 86400000,
                )
              ]
            }
          </p>
        )}
      <details className="plan-details">
        <summary>查看一周安排与完成标准</summary>
        <ol>
          {p.days.map((text, i) => (
            <li key={i}>
              <b>{DAYS[i]}</b>
              <span>{text || "灵活安排"}</span>
            </li>
          ))}
        </ol>
        {p.success && (
          <p>
            <b>本周完成标准：</b>
            {p.success}
          </p>
        )}
      </details>
    </>
  );
  return (
    <section className="weekly-plan">
      <div className="plan-heading">
        <CalendarDays size={20} />
        <h2>教练的本周计划</h2>
        <span>{range(week)}</span>
      </div>
      {current ? show(current) : <p>本周自由安排，下周计划已经发布。</p>}
      {next && (
        <details className="plan-next">
          <summary>下周计划已发布 · {range(next.weekOf)}</summary>
          {show(next)}
        </details>
      )}
      <small>教练发布的训练方向；每日达标和积分仍按任务规则计算。</small>
    </section>
  );
}

export function WeeklyPlanEditor() {
  const { snapshot } = useGame();
  const current = weekKey(snapshot.today);
  const [selected, setSelected] = useState<"current" | "next">("current");
  const week = selected === "current" ? current : addDays(current, 7);
  const plan = snapshot.state.weeklyPlans?.[week];
  if (snapshot.role !== "referee") return null;
  return (
    <section className="white-panel plan-editor">
      <div className="section-heading">
        <div>
          <h2>安排她的一周</h2>
          <p>你来写计划，发布后同步到她的首页和学习模式。</p>
        </div>
      </div>
      <div className="filter-tabs" aria-label="计划周次">
        <button
          aria-pressed={selected === "current"}
          className={selected === "current" ? "active" : ""}
          onClick={() => setSelected("current")}
        >
          本周
        </button>
        <button
          aria-pressed={selected === "next"}
          className={selected === "next" ? "active" : ""}
          onClick={() => setSelected("next")}
        >
          下周
        </button>
      </div>
      <PlanForm
        key={`${week}-${plan?.updatedAt ?? "new"}`}
        week={week}
        plan={plan}
      />
    </section>
  );
}
function PlanForm({ week, plan }: { week: string; plan?: WeeklyPlan }) {
  const { act, busy } = useGame();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        await act({
          type: "weeklyPlan",
          plan: {
            weekOf: week,
            goal: String(form.get("goal")),
            outreach: String(form.get("outreach")),
            focus: String(form.get("focus")),
            success: String(form.get("success")),
            days: DAYS.map((_, i) => String(form.get(`day-${i}`))),
          },
        });
      }}
    >
      <p className="muted">
        {range(week)} · {plan ? "已发布，可继续修改" : "尚未发布"}
      </p>
      <label>
        本周目标
        <input
          name="goal"
          required
          maxLength={160}
          defaultValue={plan?.goal ?? ""}
          placeholder="例如：完成重点岗位投递，把项目的评估方法讲清楚"
        />
      </label>
      <div className="plan-priorities">
        <label>
          投递与 Networking 重点
          <textarea
            name="outreach"
            rows={3}
            maxLength={500}
            defaultValue={plan?.outreach ?? ""}
            placeholder="目标公司、重点联系人、需要跟进的申请…"
          />
        </label>
        <label>
          学习重点
          <textarea
            name="focus"
            rows={3}
            maxLength={500}
            defaultValue={plan?.focus ?? ""}
            placeholder="技术短板、项目复盘、BQ 或英语表达…"
          />
        </label>
      </div>
      <details className="plan-details" open={Boolean(plan)}>
        <summary>每天怎么安排（可选）</summary>
        <div className="plan-day-fields">
          {DAYS.map((day, i) => (
            <label key={day}>
              <span>{day}</span>
              <input
                name={`day-${i}`}
                maxLength={300}
                defaultValue={plan?.days[i] ?? ""}
                placeholder="可以同时安排投递、联系和学习；留空表示灵活安排"
              />
            </label>
          ))}
        </div>
      </details>
      <label>
        本周完成标准
        <textarea
          name="success"
          rows={2}
          maxLength={500}
          defaultValue={plan?.success ?? ""}
          placeholder="例如：跟进 5 位联系人；不看笔记讲清 baseline、验证方法和业务价值"
        />
      </label>
      <div className="plan-publish">
        <p>
          发布后她刷新即可看到，打开页面时也会自动同步。这里的计划不会额外增加打卡门槛。
        </p>
        <button className="button primary" disabled={busy}>
          <Send size={16} />
          {busy ? "正在发布…" : plan ? "更新计划" : "发布计划"}
        </button>
      </div>
    </form>
  );
}
