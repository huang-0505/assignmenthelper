"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  FolderOpen,
  Gift,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Plus,
  ShieldCheck,
  Snowflake,
  Star,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  addDays,
  bqDone,
  completedBq,
  episodesDone,
  finalScore,
  latestAnswer,
  requirements,
} from "@/lib/engine";
import type {
  Audit,
  DayStatus,
  Project,
  Question,
  Settings,
} from "@/lib/types";
import { toast } from "sonner";
import {
  COACH_MOODS,
  DEFAULT_COACH_LINES,
  withDefaults,
  type CoachMood,
  type StudyRules,
} from "@/lib/study";
import { photoJpeg } from "@/lib/study-detector";
import data from "../../data/bq.json";
import { useGame } from "./provider";
import { DoorWindow } from "./study-parts";
import { Modal, Progress, SectionHeading, Status, statusLabel } from "./ui";
function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-title">
      <div>
        <p className="date-line">{subtitle}</p>
        <h1>
          {title}
          <span className="title-dot" />
        </h1>
      </div>
    </div>
  );
}
export function History() {
  const { snapshot } = useGame(),
    [month, setMonth] = useState(snapshot.today.slice(0, 7)),
    [selected, setSelected] = useState<string | null>(null);
  const date = new Date(`${month}-01T12:00:00Z`),
    offset = (date.getUTCDay() + 6) % 7,
    count = new Date(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      0,
    ).getDate();
  function move(n: number) {
    const d = new Date(date);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  }
  const results = snapshot.summary.days.filter((d) => d.date.startsWith(month));
  return (
    <>
      <PageTitle title="每一步，都有迹可循" subtitle="打卡日历" />
      <div className="history-layout">
        <section className="calendar-panel">
          <div className="calendar-heading">
            <h2>
              {date.getUTCFullYear()} 年 {date.getUTCMonth() + 1} 月
            </h2>
            <div>
              <button
                className="icon-button"
                onClick={() => move(-1)}
                aria-label="上个月"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="text-button"
                onClick={() => setMonth(snapshot.today.slice(0, 7))}
              >
                本月
              </button>
              <button
                className="icon-button"
                onClick={() => move(1)}
                disabled={month >= snapshot.today.slice(0, 7)}
                aria-label="下个月"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="calendar-weekdays">
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <span key={w}>周{w}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {Array.from({ length: offset }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const key = `${month}-${String(i + 1).padStart(2, "0")}`,
                result = snapshot.summary.days.find((d) => d.date === key),
                active = key === snapshot.today;
              return (
                <button
                  disabled={!result}
                  onClick={() => setSelected(key)}
                  key={key}
                  className={`calendar-day ${result?.status || ""} ${active ? "today" : ""}`}
                  aria-label={`${key} ${result ? statusLabel[result.status] : "无记录"}`}
                >
                  <strong>{i + 1}</strong>
                  {result ? (
                    <>
                      <span>
                        {result.status === "frozen" ? (
                          <Snowflake size={18} />
                        ) : result.status === "met" ||
                          result.status === "gold" ? (
                          <Check size={18} />
                        ) : result.status === "missed" ? (
                          <X size={18} />
                        ) : (
                          <Clock3 size={16} />
                        )}
                      </span>
                      <small>{statusLabel[result.status]}</small>
                    </>
                  ) : (
                    <span className="no-record">—</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            {(
              ["met", "gold", "missed", "frozen", "pending"] as DayStatus[]
            ).map((s) => (
              <Status key={s} status={s} />
            ))}
          </div>
        </section>
        <aside className="history-aside">
          <div className="month-summary">
            <CalendarDays size={27} />
            <h2>这个月的积累</h2>
            <div>
              <span>成功打卡</span>
              <strong>
                {
                  results.filter((d) => ["met", "gold"].includes(d.status))
                    .length
                }
                <small> 天</small>
              </strong>
            </div>
            <div>
              <span>获得积分</span>
              <strong>{results.reduce((sum, d) => sum + d.points, 0)}</strong>
            </div>
            <div>
              <span>冻结保护</span>
              <strong>
                {results.filter((d) => d.status === "frozen").length}
                <small> 次</small>
              </strong>
            </div>
          </div>
          <p className="muted">
            点击有记录的日期，查看当日任务、答案与评审。待审核的日期会保留结果，等裁判决定后再计算连胜。
          </p>
        </aside>
      </div>
      {selected && (
        <DayDetail date={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
export function DayDetail({
  date,
  close,
}: {
  date: string;
  close: () => void;
}) {
  const { snapshot } = useGame(),
    day = snapshot.state.days[date],
    result = snapshot.summary.days.find((d) => d.date === date)!;
  const bq = (data as Question[]).find((q) => q.id === day.bq?.questionId);
  return (
    <Modal title={`${date} 的训练记录`} close={close} className="day-detail">
      <div className="day-detail-status">
        <Status status={result.status} />
        <span>
          +{result.points} 积分 · 连胜 {result.streak} 天
        </span>
      </div>
      <div className="day-detail-counts">
        <div>
          申请
          <strong>
            {day.applications} / {day.settings.applications}
          </strong>
        </div>
        <div>
          联系人
          <strong>
            {day.contacts} / {day.settings.contacts}
          </strong>
        </div>
        <div>
          BQ
          <strong>
            {!day.bq ? "全部毕业" : day.bq.completedAt ? "已完成" : "未完成"}
          </strong>
        </div>
        <div>
          英语看剧
          <strong>
            {day.settings.episodes
              ? `${day.episodes ?? 0} / ${day.settings.episodes} 集`
              : "不要求"}
          </strong>
        </div>
      </div>
      <h3>
        面试题 <span className="muted">{day.question?.category}</span>
      </h3>
      <p className="english-question" lang="en">
        {day.question?.prompt || "当天尚未录入项目"}
      </p>
      {day.answers.length === 0 ? (
        <p className="muted">这一天没有提交答案。</p>
      ) : (
        day.answers.map((answer, i) => (
          <article className="answer-review" key={answer.id}>
            <div className="review-meta">
              <strong>第 {i + 1} 次回答</strong>
              <span>
                {finalScore(answer) === null
                  ? "等待人工审核"
                  : `${finalScore(answer)} / 5 分`}
              </span>
            </div>
            <p className="answer-text">{answer.text}</p>
            <div className="review-ai">
              <strong>
                AI 反馈{" "}
                {answer.grade.score !== null && `· ${answer.grade.score}/5`}
              </strong>
              <p>{answer.grade.tip}</p>
              {answer.grade.missing.length > 0 && (
                <ul>
                  {answer.grade.missing.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            {answer.override && (
              <div className="override-note">
                <ShieldCheck size={16} />
                <p>
                  <strong>裁判最终评分：{answer.override.score} / 5</strong>
                  <br />
                  {answer.override.reason}
                </p>
              </div>
            )}
            {snapshot.role === "referee" && (
              <ReviewForm
                date={date}
                answerId={answer.id}
                score={finalScore(answer) ?? 3}
              />
            )}
          </article>
        ))
      )}
      {day.bq && (
        <div className="detail-bq">
          <h3>BQ · {day.bq.stage === 1 ? "STAR 草稿" : "口述练习"}</h3>
          <p lang="en">{bq?.prompt}</p>
          <p className="answer-text">{day.bq.text || "尚未填写"}</p>
          <span className="muted">
            {day.bq.practiced
              ? "已确认大声练习"
              : day.bq.stage === 2
                ? "尚未确认练习"
                : "口述安排在后续日期"}
          </span>
        </div>
      )}
      {Boolean(day.settings.episodes) && (
        <div className="detail-bq">
          <h3>英语表达和听力</h3>
          <p className="answer-text">
            {day.episodeNote || "没有填写剧名或学到的表达"}
          </p>
          <span className="muted">
            {episodesDone(day)
              ? `刚好 ${day.settings.episodes} 集，已完成`
              : `记录了 ${day.episodes ?? 0} 集，要求刚好 ${day.settings.episodes} 集`}
          </span>
        </div>
      )}
      {day.logs.length > 0 && (
        <div className="recent-logs">
          <h3>申请与联系记录</h3>
          {day.logs.map((l) => (
            <div key={l.id}>
              <span>
                {l.kind === "application" ? "申请" : "联系"} +{l.count} ·{" "}
                {l.company || "未填写公司"}
              </span>
              {l.link && (
                <a href={l.link} target="_blank" rel="noreferrer">
                  查看链接
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
function ReviewForm({
  date,
  answerId,
  score,
}: {
  date: string;
  answerId: string;
  score: number;
}) {
  const { act, busy } = useGame(),
    [selected, setSelected] = useState(score),
    [reason, setReason] = useState("");
  return (
    <form
      className="review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act({
            type: "override",
            date,
            answerId,
            score: selected,
            reason,
          })
        )
          setReason("");
      }}
    >
      <h4>裁判审核 / 改分</h4>
      <label>
        最终评分
        <select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} 分 · {n >= 3 ? "通过" : "不通过"}
            </option>
          ))}
        </select>
      </label>
      <label>
        评审说明
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={1000}
          required
          placeholder="说明通过或需改进的原因"
        />
      </label>
      <div className="review-actions">
        <button className="button primary" disabled={busy}>
          保存裁判评分
        </button>
        <span className="muted small">保存后自动重新计算历史连胜与罚金。</span>
      </div>
    </form>
  );
}
export function Stats() {
  const { snapshot } = useGame(),
    { summary, state } = snapshot;
  const days = Object.values(state.days),
    totals = days.reduce(
      (acc, d) => ({
        apps: acc.apps + d.applications,
        contacts: acc.contacts + d.contacts,
      }),
      { apps: 0, contacts: 0 },
    );
  const progress = completedBq(state),
    categories = ["ML", "AI/LLM", "SQL", "Python", "Project"];
  return (
    <>
      <PageTitle title="看见，正在变强的你" subtitle="成长记录" />
      <div className="stat-strip">
        {[
          {
            label: "当前连胜",
            value: summary.streak,
            unit: "天",
            icon: Flame,
            tone: "peach",
          },
          {
            label: "累计积分",
            value: summary.points,
            unit: "分",
            icon: Star,
            tone: "yellow",
          },
          {
            label: "投递申请",
            value: totals.apps,
            unit: "份",
            icon: Target,
            tone: "blue",
          },
          {
            label: "建立联系",
            value: totals.contacts,
            unit: "人",
            icon: TrendingUp,
            tone: "green",
          },
        ].map(({ label, value, unit, icon: Icon, tone }) => (
          <div key={label}>
            <span className={`task-icon ${tone}`}>
              <Icon size={23} />
            </span>
            <p>{label}</p>
            <strong>
              {value.toLocaleString()}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <div className="stats-grid">
        <section className="white-panel">
          <SectionHeading
            title="最近 14 天"
            note={`最长连胜 ${summary.bestStreak} 天，努力正在积累。`}
          />
          <div
            className="activity-chart"
            role="img"
            aria-label={`最近14天获得积分 ${summary.days.filter((d) => d.date >= addDays(snapshot.today, -13)).reduce((n, d) => n + d.points, 0)} 分`}
          >
            {Array.from({ length: 14 }, (_, i) => {
              const date = addDays(snapshot.today, i - 13),
                d = summary.days.find((d) => d.date === date),
                max = Math.max(1, ...summary.days.map((d) => d.points));
              return (
                <div key={date}>
                  <span className="bar-number">{d?.points || ""}</span>
                  <div className="bar-track">
                    <span
                      className={d?.status || ""}
                      style={{
                        height: `${d ? Math.max(3, (d.points / max) * 100) : 3}%`,
                      }}
                    />
                  </div>
                  <small>{date.slice(8)}</small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="white-panel">
          <SectionHeading
            title="面试训练分布"
            note="每个类别按日期计数，最终评分 ≥ 3 为通过。"
          />
          <div className="category-stats">
            {categories.map((c) => {
              const assigned = days.filter((d) => d.question?.category === c),
                passed = assigned.filter(
                  (d) => (finalScore(latestAnswer(d)) ?? 0) >= 3,
                ).length;
              return (
                <div key={c}>
                  <div>
                    <span>{c === "Project" ? "项目深挖" : c}</span>
                    <strong>
                      {passed} / {assigned.length}
                    </strong>
                  </div>
                  <Progress
                    value={
                      assigned.length ? (passed / assigned.length) * 100 : 0
                    }
                    label={`${c}通过率`}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section className="rewards-section">
        <SectionHeading
          title="属于你的里程碑"
          note="只有重要的时刻，值得盛大庆祝。"
        />
        <div className="reward-grid">
          {[...state.settings.rewards]
            .sort((a, b) => a.streak - b.streak)
            .map((r) => {
              const earned = summary.rewards.find((e) => e.streak === r.streak);
              return (
                <div
                  className={`reward-tile ${earned ? "unlocked" : ""}`}
                  key={r.streak}
                >
                  <span className="reward-tile-icon">
                    {earned ? <Gift size={29} /> : <LockKeyhole size={27} />}
                  </span>
                  <span className="reward-days">{r.streak} 天连胜</span>
                  <h3>{earned?.text || r.text}</h3>
                  <p>
                    {earned
                      ? `${earned.date} 已解锁`
                      : `还需 ${Math.max(0, r.streak - summary.streak)} 天`}
                  </p>
                </div>
              );
            })}
        </div>
      </section>
      <section className="white-panel">
        <SectionHeading
          title="12 个故事，24 次进步"
          note={`已完成 ${summary.bqCompleted} 道 BQ 的草稿与口述。全部完成后，不再计入每日最低要求。`}
        />
        <div className="bq-bank-list">
          {(data as Question[])
            .filter((q) => q.category === "BQ")
            .map((q) => {
              const p = progress.get(q.id);
              return (
                <div key={q.id}>
                  <span>{q.id.split("-")[1]}</span>
                  <p lang="en">{q.prompt}</p>
                  <span className={p?.draft ? "stage-done" : ""}>
                    {p?.draft ? <Check size={14} /> : <Pencil size={14} />}
                    {p?.draft ? "草稿完成" : "待写草稿"}
                  </span>
                  <span className={p?.practice ? "stage-done" : ""}>
                    {p?.practice ? <Check size={14} /> : <Clock3 size={14} />}
                    {p?.practice ? "口述完成" : "待练口述"}
                  </span>
                </div>
              );
            })}
        </div>
      </section>
    </>
  );
}
export function Projects() {
  const { snapshot, act, busy } = useGame(),
    [editing, setEditing] = useState<Project | null>(null),
    projects = snapshot.state.projects;
  const isPlayer = snapshot.role === "player";
  function start() {
    setEditing({
      id: crypto.randomUUID(),
      title: "",
      summary: "",
      role: "",
      methods: "",
      metrics: "",
    });
  }
  return (
    <>
      <PageTitle title="你的项目，你来讲透" subtitle="项目档案" />
      <div className="project-intro">
        <span className="project-intro-icon">
          <FolderOpen size={35} />
        </span>
        <div>
          <h2>准备 2–3 个，你真正参与过的项目。</h2>
          <p>
            每到项目深挖日，我们会围绕你的方法选择、个人贡献、衡量方式和失败场景，提出一个具体追问。
          </p>
        </div>
        {isPlayer && (
          <button
            className="button primary"
            onClick={start}
            disabled={projects.length >= 3}
          >
            <Plus size={17} /> 添加项目
          </button>
        )}
      </div>
      <div className="project-grid">
        {projects.map((p, i) => (
          <article className="project-card" key={p.id}>
            <div className="project-card-top">
              <span className="project-number">
                Project {String(i + 1).padStart(2, "0")}
              </span>
              {isPlayer && (
                <button
                  className="icon-button"
                  aria-label={`编辑${p.title}`}
                  onClick={() => setEditing(p)}
                >
                  <Pencil size={18} />
                </button>
              )}
            </div>
            <h2>{p.title}</h2>
            <p>{p.summary}</p>
            <dl>
              <dt>我负责的部分</dt>
              <dd>{p.role}</dd>
              <dt>方法与技术</dt>
              <dd>{p.methods}</dd>
              <dt>结果与指标</dt>
              <dd>{p.metrics}</dd>
            </dl>
            <span className="project-ready">
              <Check size={14} /> 已加入项目深挖题库
            </span>
          </article>
        ))}
        {projects.length < 3 && isPlayer && (
          <button className="add-project-card" onClick={start}>
            <span>
              <Plus size={30} />
            </span>
            <strong>添加{projects.length ? "下一个" : "第一个"}项目</strong>
            <p>一个真实的问题，一段属于你的经历。</p>
          </button>
        )}
      </div>
      {projects.length < 2 && (
        <p className="form-hint">
          建议录入至少 2 个项目，让项目深挖训练覆盖不同经历。
        </p>
      )}
      {editing && (
        <Modal
          title={
            projects.some((p) => p.id === editing.id) ? "编辑项目" : "添加项目"
          }
          close={() => setEditing(null)}
        >
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const project = {
                id: editing.id,
                title: String(form.get("title")),
                summary: String(form.get("summary")),
                role: String(form.get("role")),
                methods: String(form.get("methods")),
                metrics: String(form.get("metrics")),
              };
              if (await act({ type: "project", project })) setEditing(null);
            }}
          >
            <label>
              项目名称
              <input
                name="title"
                defaultValue={editing.title}
                minLength={2}
                maxLength={200}
                required
                placeholder="例如：面向订阅用户的流失预测"
              />
            </label>
            <label>
              项目背景与目标
              <textarea
                name="summary"
                defaultValue={editing.summary}
                minLength={20}
                maxLength={2000}
                required
                rows={3}
                placeholder="为谁解决什么问题？至少 20 个字符。"
              />
            </label>
            <label>
              你个人负责的部分
              <textarea
                name="role"
                defaultValue={editing.role}
                minLength={5}
                maxLength={1000}
                required
                rows={2}
                placeholder="具体到你亲自做出的决定和交付。"
              />
            </label>
            <label>
              方法与技术
              <input
                name="methods"
                defaultValue={editing.methods}
                minLength={3}
                maxLength={1000}
                required
                placeholder="例如：LightGBM、时间切分验证、SHAP"
              />
            </label>
            <label>
              结果、指标与衡量方式
              <textarea
                name="metrics"
                defaultValue={editing.metrics}
                minLength={3}
                maxLength={1000}
                required
                rows={2}
                placeholder="写明基线、提升幅度和验证方式；未测量也可如实说明。"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              保存项目档案
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Referee() {
  const { snapshot, act, busy } = useGame(),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [redeemOpen, setRedeemOpen] = useState(false);
  if (snapshot.role !== "referee") return <Restricted />;
  const { summary, state } = snapshot,
    pending = Object.values(state.days).filter((d) => {
      const answer = latestAnswer(d);
      return answer && finalScore(answer) === null;
    });
  const days = [...summary.days]
    .reverse()
    .filter(
      (d) =>
        filter === "all" ||
        (filter === "review"
          ? pending.some((p) => p.date === d.date)
          : d.status === "missed" || d.status === "frozen"),
    );
  return (
    <>
      <PageTitle title="做她最靠谱的加油官" subtitle="裁判工作台" />
      <NotePanel />
      <div className="referee-summary">
        <div>
          <span className="task-icon lavender">
            <ShieldCheck size={24} />
          </span>
          <p>等待你的评审</p>
          <strong>
            {pending.length}
            <small> 天</small>
          </strong>
        </div>
        <div>
          <span className="task-icon peach">
            <Flame size={24} />
          </span>
          <p>当前连胜</p>
          <strong>
            {summary.streak}
            <small> 天</small>
          </strong>
        </div>
        <div className="pool-stat">
          <span className="task-icon yellow">
            <Gift size={24} />
          </span>
          <p>请客基金</p>
          <strong>
            ${summary.pool}
            <small> / ${state.settings.penaltyThreshold}</small>
          </strong>
          <button
            className="small-button"
            disabled={busy || summary.pool < state.settings.penaltyThreshold}
            onClick={() => setRedeemOpen(true)}
          >
            确认已请客
          </button>
        </div>
      </div>
      <RefereeStats />
      {summary.pool >= state.settings.penaltyThreshold && (
        <div className="penalty-banner">
          <Gift />
          <strong>请裁判吃饭</strong>
          <span>兑换后清空当前累计金额，并保留兑换记录。</span>
        </div>
      )}
      <TodayLive open={setSelected} />
      <section className="white-panel referee-days">
        <div className="section-heading">
          <h2>每日训练记录</h2>
          <div className="filter-tabs" aria-label="筛选训练记录">
            {[
              ["all", "全部"],
              ["review", `待评审 ${pending.length}`],
              ["missed", "未达标 / 冻结"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="day-table">
          <div className="day-table-head">
            <span>日期</span>
            <span>任务进度</span>
            <span>面试评分</span>
            <span>状态</span>
            <span />
          </div>
          {days.length === 0 && (
            <div className="empty-state">
              <Check size={32} />
              <h3>这里已经处理完啦</h3>
              <p>新的训练记录会出现在这里。</p>
            </div>
          )}
          {days.map((d) => {
            const day = state.days[d.date],
              score = finalScore(latestAnswer(day)),
              req = requirements(day);
            return (
              <button
                className="day-table-row"
                key={d.date}
                onClick={() => setSelected(d.date)}
              >
                <strong>
                  {d.date}
                  <small>{day.question?.category || "项目深挖"}</small>
                </strong>
                <span>
                  {req.completed} / {req.required} 已完成
                  <small>
                    申请 {day.applications}/{day.settings.applications} · 联系{" "}
                    {day.contacts}/{day.settings.contacts}
                    {day.settings.episodes
                      ? ` · 看剧 ${day.episodes ?? 0}/${day.settings.episodes}`
                      : ""}
                  </small>
                </span>
                <span>
                  {score === null
                    ? day.answers.length
                      ? "待评审"
                      : "未作答"
                    : `${score} / 5`}
                </span>
                <Status status={d.status} />
                <ChevronRight size={18} />
              </button>
            );
          })}
        </div>
      </section>
      <PlayerActivity />
      <section className="audit-section">
        <SectionHeading title="最近的裁判操作" />
        <div>
          {state.audit
            .filter((a) => REFEREE_ACTIONS.includes(a.action))
            .slice(-10)
            .reverse()
            .map((a) => (
              <div className="audit-row" key={a.id}>
                <ShieldCheck size={16} />
                <p>
                  {a.date && `${a.date} · `}
                  {a.detail}
                </p>
                <time>{nyTime(a.at)}</time>
              </div>
            ))}
          {!state.audit.some((a) => REFEREE_ACTIONS.includes(a.action)) && (
            <p className="muted">第一次评审或修改设置后，会在这里留下记录。</p>
          )}
        </div>
      </section>
      {selected && (
        <DayDetail date={selected} close={() => setSelected(null)} />
      )}
      {redeemOpen && (
        <Modal title="确认已请裁判吃饭" close={() => setRedeemOpen(false)}>
          <p>
            将兑换当前 ${summary.pool}{" "}
            请客基金。确认后金额归零，兑换记录会永久保留。
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              if (await act({ type: "redeem" })) setRedeemOpen(false);
            }}
          >
            已请客，兑换 ${summary.pool}
          </button>
        </Modal>
      )}
    </>
  );
}
const REFEREE_ACTIONS = [
  "override",
  "settings",
  "redeem",
  "playerName",
  "coachLines",
  "coachPhoto",
  "coachNote",
  "studyOverturn",
  "studyVisit",
];
/** The referee's one line for her Today page, written beside the face she will see it with. */
function NotePanel() {
  const { snapshot, act, busy } = useGame(),
    note = snapshot.state.coach?.note ?? null,
    version = snapshot.state.coach?.photos?.calm;
  const [text, setText] = useState(note?.text ?? "");
  return (
    <section className="white-panel note-panel">
      <DoorWindow
        src={version ? `/api/study/media?coach=calm&v=${version}` : null}
        mood="calm"
        size="sm"
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await act({ type: "coachNote", text });
        }}
      >
        <label htmlFor="coach-note">
          给她留一句话
          <small>
            显示在她今日页面的最上面，用的是「查岗中」这张脸。改掉或清除之前一直在。
          </small>
        </label>
        <div className="note-row">
          <input
            id="coach-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={120}
            placeholder="例如：今天的 SQL 题偏难，写清楚思路就行"
          />
          <button className="button primary" disabled={busy || !text.trim()}>
            <MessageSquareText size={17} /> 放到她的页面
          </button>
          {note && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (await act({ type: "coachNote", text: "" })) setText("");
              }}
            >
              清除
            </button>
          )}
        </div>
        {note && (
          <p className="muted small">
            她现在看到的：“{note.text}” · {nyTime(note.at)}
          </p>
        )}
      </form>
    </section>
  );
}
const nyTime = (at: string) =>
  new Date(at).toLocaleString("zh-CN", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function RefereeStats() {
  const { summary, state } = useGame().snapshot,
    days = Object.values(state.days),
    total = (pick: (d: (typeof days)[number]) => number) =>
      days.reduce((n, d) => n + pick(d), 0);
  const stats: [string, string | number][] = [
    ["总积分", summary.points],
    ["最长连胜", `${summary.bestStreak} 天`],
    ["冻结卡", `${summary.freezes} / 2`],
    [
      "达标天数",
      `${summary.days.filter((d) => d.status === "met" || d.status === "gold").length} / ${summary.days.filter((d) => d.status !== "open").length}`,
    ],
    ["累计申请", total((d) => d.applications)],
    ["累计联系", total((d) => d.contacts)],
    ["累计看剧", `${total((d) => d.episodes ?? 0)} 集`],
  ];
  return (
    <div className="referee-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
function TodayLive({ open }: { open: (date: string) => void }) {
  const { state, today, summary, serverTime } = useGame().snapshot,
    day = state.days[today],
    s = day.settings,
    answer = latestAnswer(day),
    score = finalScore(answer),
    watched = day.episodes ?? 0;
  const left = Math.max(
    0,
    Math.round((Date.parse(day.closesAt) - Date.parse(serverTime)) / 60000),
  );
  const tasks = [
    {
      label: "投递申请",
      value: `${day.applications} / ${s.applications} 份`,
      done: day.applications >= s.applications,
    },
    {
      label: "联系新朋友",
      value: `${day.contacts} / ${s.contacts} 人`,
      done: day.contacts >= s.contacts,
    },
    {
      label: `面试题 · ${day.question?.category ?? "项目深挖"}`,
      value: !answer
        ? "未作答"
        : score === null
          ? "等你评审"
          : `${score} / 5 分`,
      done: (score ?? 0) >= 3,
    },
    ...(day.bq
      ? [
          {
            label: `BQ ${day.bq.questionId.split("-")[1]} / 12 · ${day.bq.stage === 1 ? "STAR 草稿" : "口述练习"}`,
            value: bqDone(day.bq) ? "已完成" : "未完成",
            done: bqDone(day.bq),
          },
        ]
      : []),
    ...(s.episodes
      ? [
          {
            label: "英语看剧",
            value: `${watched} / ${s.episodes} 集${watched > s.episodes ? "（超了）" : ""}`,
            done: episodesDone(day),
          },
        ]
      : []),
  ];
  return (
    <section className="white-panel today-live">
      <SectionHeading
        title="今日实况"
        note={`${today} · 纽约时间 ${String(s.closeHour).padStart(2, "0")}:00 结算，还剩 ${Math.floor(left / 60)}h ${left % 60}m`}
      >
        <Status status={summary.days.find((d) => d.date === today)!.status} />
      </SectionHeading>
      <div className="live-tasks">
        {tasks.map((t) => (
          <div key={t.label} className={t.done ? "done" : ""}>
            {t.done ? (
              <span className="check-badge" aria-label="已完成">
                <Check size={14} />
              </span>
            ) : (
              <span className="todo-dot" aria-label="未完成" />
            )}
            <span>{t.label}</span>
            <strong>{t.value}</strong>
          </div>
        ))}
      </div>
      {day.logs.length > 0 && (
        <div className="recent-logs">
          <h3>今天的申请与联系</h3>
          {day.logs.map((l) => (
            <div key={l.id}>
              <span>
                {nyTime(l.at).split(" ").at(-1)} ·{" "}
                {l.kind === "application" ? "申请" : "联系"} +{l.count} ·{" "}
                {l.company || "未填写备注"}
              </span>
              {l.link && (
                <a href={l.link} target="_blank" rel="noreferrer">
                  查看链接
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {day.episodeNote && (
        <p className="live-note">
          <strong>看剧记录：</strong>
          {day.episodeNote}
        </p>
      )}
      <button className="text-button" onClick={() => open(today)}>
        查看今天的答案和全部详情 <ChevronRight size={16} />
      </button>
    </section>
  );
}
function PlayerActivity() {
  const { state } = useGame().snapshot;
  const logs = new Map(
      Object.values(state.days).flatMap((d) =>
        d.logs.map((l) => [l.id, l] as const),
      ),
    ),
    answers = new Map(
      Object.values(state.days).flatMap((d) =>
        d.answers.map((a) => [a.id, a] as const),
      ),
    );
  const describe = (a: Audit) => {
    switch (a.action) {
      case "log": {
        const l = logs.get(a.id);
        return l
          ? `${l.kind === "application" ? "投递申请" : "联系新朋友"} +${l.count}${l.company ? ` · ${l.company}` : ""}`
          : "记录了一条申请 / 联系（后来删除了）";
      }
      case "removeLog":
        return "删除了一条申请 / 联系记录";
      case "answer": {
        const score = answers.has(a.id)
          ? finalScore(answers.get(a.id))
          : undefined;
        return `提交面试题答案${score === null ? "（等你评审）" : score ? `（${score} / 5 分）` : ""}`;
      }
      case "bq":
        return a.date && state.days[a.date]?.bq?.stage === 2
          ? "完成 BQ 口述练习"
          : "保存 BQ STAR 草稿";
      case "retell":
        return "记录每周 BQ 复述";
      case "project":
        return "新增或编辑了项目";
      default:
        return a.detail;
    }
  };
  const entries = state.audit
    .filter((a) => !REFEREE_ACTIONS.includes(a.action))
    .slice(-15)
    .reverse();
  return (
    <section className="audit-section">
      <SectionHeading
        title="她的最近动态"
        note="她每次保存都会记录在这里，时间为纽约时间。"
      />
      <div>
        {entries.map((a) => (
          <div className="audit-row" key={a.id}>
            <Activity size={16} />
            <p>
              {a.date && `${a.date} · `}
              {describe(a)}
            </p>
            <time>{nyTime(a.at)}</time>
          </div>
        ))}
        {!entries.length && (
          <p className="muted">她开始记录后，每一步都会出现在这里。</p>
        )}
      </div>
    </section>
  );
}
function Restricted() {
  return (
    <div className="access-message">
      <LockKeyhole size={40} />
      <h1>这是裁判的工作区</h1>
      <p>裁判请使用专属入口链接进入。演示模式可以在页面顶部切换视角。</p>
      <Link href="/" className="button primary">
        回到今日挑战
      </Link>
    </div>
  );
}
export function SettingsView() {
  const { snapshot, act, busy } = useGame();
  if (snapshot.role !== "referee") return <Restricted />;
  return (
    <>
      <PageTitle title="把约定，设置成规则" subtitle="挑战设置" />
      <PlayerNameForm
        key={snapshot.state.playerName}
        name={snapshot.state.playerName}
        save={(name) => act({ type: "playerName", name })}
        busy={busy}
      />
      <CoachSettings key={JSON.stringify(snapshot.state.coach?.lines)} />
      <SettingsForm
        key={JSON.stringify(
          snapshot.state.nextSettings || snapshot.state.settings,
        )}
        settings={snapshot.state.nextSettings || snapshot.state.settings}
        pending={Boolean(snapshot.state.nextSettings)}
        save={(settings) => act({ type: "settings", settings })}
        busy={busy}
      />
    </>
  );
}
type StudyField = {
  key: Exclude<keyof StudyRules, "strict">;
  label: string;
  min: number;
  max: number;
  step?: number;
};
const STUDY_FIELDS: StudyField[] = [
  { key: "minutes", label: "每次时长（分钟）", min: 5, max: 120 },
  { key: "maxStrikes", label: "几次违规算失败", min: 1, max: 10 },
  { key: "warningsPerStrike", label: "几次提醒算 1 次违规", min: 1, max: 5 },
  { key: "minGap", label: "查岗间隔最短（分钟）", min: 1, max: 30 },
  { key: "maxGap", label: "查岗间隔最长（分钟）", min: 1, max: 60 },
  { key: "points", label: "通过奖励积分", min: 0, max: 1000 },
  { key: "penalty", label: "失败罚金（美元）", min: 0, max: 1000 },
  {
    key: "pauseMinutes",
    label: "暂停上限（分钟，0 为不能暂停）",
    min: 0,
    max: 30,
  },
];
const STUDY_DETECTION: StudyField[] = [
  {
    key: "absentSeconds",
    label: "离开镜头多久算一次（秒）",
    min: 10,
    max: 1800,
  },
  {
    key: "phoneHits",
    label: "最近 5 次检测里看到手机几次算一次",
    min: 1,
    max: 5,
  },
  {
    key: "lookAwaySeconds",
    label: "视线离开多久算一次（秒，0 为不检查）",
    min: 0,
    max: 1800,
  },
  { key: "yawTolerance", label: "左右转头容差（度）", min: 5, max: 60 },
  { key: "pitchTolerance", label: "抬头低头容差（度）", min: 5, max: 60 },
  {
    key: "drowsySeconds",
    label: "闭眼多久算一次（秒，0 为不检查）",
    min: 0,
    max: 600,
  },
  {
    key: "blinkThreshold",
    label: "闭眼判定阈值（0.3–0.95）",
    min: 0.3,
    max: 0.95,
    step: 0.05,
  },
  {
    key: "aiConfidence",
    label: "AI 把握度达到多少才提醒（0.5–0.99）",
    min: 0.5,
    max: 0.99,
    step: 0.01,
  },
];
function StudyInputs({
  fields,
  rules,
}: {
  fields: StudyField[];
  rules: StudyRules;
}) {
  return (
    <div className="settings-fields">
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          <input
            type="number"
            name={`study-${f.key}`}
            min={f.min}
            max={f.max}
            step={f.step ?? 1}
            defaultValue={rules[f.key]}
            required
          />
        </label>
      ))}
    </div>
  );
}
const MOOD_NAME: Record<CoachMood, string> = {
  calm: "查岗中",
  angry: "看到走神",
  pleased: "一切正常",
};
/** The coach is the referee's own photos; changes apply at the next inspection, not the next day. */
function CoachSettings() {
  const { snapshot, act, busy, refresh } = useGame(),
    coach = snapshot.state.coach,
    lines = { ...DEFAULT_COACH_LINES, ...coach?.lines };
  const [uploading, setUploading] = useState<CoachMood | null>(null);
  async function upload(mood: CoachMood, file: File | null) {
    setUploading(mood);
    try {
      const image = file ? await photoJpeg(file) : null;
      const res = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "coachPhoto", mood, image }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refresh();
      toast.success(file ? "照片已更新" : "照片已删除");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "照片没有保存，请重试",
      );
    } finally {
      setUploading(null);
    }
  }
  return (
    <form
      className="white-panel coach-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget),
          line = (mood: CoachMood) => String(form.get(`line-${mood}`));
        void act({
          type: "coachLines",
          lines: {
            calm: line("calm"),
            angry: line("angry"),
            pleased: line("pleased"),
          },
        });
      }}
    >
      <SectionHeading
        title="学习模式教练"
        note="用你自己的照片。查岗时教练从教室后门的小窗探头：查岗中、看到走神、一切正常，各一张照片和一句话。修改马上生效。"
      />
      <div className="coach-grid">
        {COACH_MOODS.map((mood) => {
          const version = coach?.photos?.[mood];
          return (
            <div key={mood} className="coach-slot">
              <DoorWindow
                src={
                  version ? `/api/study/media?coach=${mood}&v=${version}` : null
                }
                mood={mood}
              />
              <strong>{MOOD_NAME[mood]}</strong>
              <div className="coach-slot-actions">
                <label className="small-button file-button">
                  {uploading === mood
                    ? "上传中…"
                    : version
                      ? "换一张"
                      : "上传照片"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(mood, file);
                    }}
                  />
                </label>
                {version && (
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={uploading !== null}
                    onClick={() => void upload(mood, null)}
                  >
                    删除
                  </button>
                )}
              </div>
              <label>
                这时说的话
                <input
                  name={`line-${mood}`}
                  defaultValue={lines[mood]}
                  maxLength={60}
                  required
                />
              </label>
            </div>
          );
        })}
      </div>
      <button className="button primary" disabled={busy}>
        保存教练台词
      </button>
    </form>
  );
}
function PlayerNameForm({
  name,
  save,
  busy,
}: {
  name?: string;
  save: (name: string) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <form
      className="white-panel player-name-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void save(String(new FormData(e.currentTarget).get("playerName")));
      }}
    >
      <SectionHeading
        title="玩家名字"
        note="玩家在首页输入这个名字进入，不区分大小写。还没设置时，第一个输入的名字会成为玩家名字；改名后玩家需用新名字重新进入。"
      />
      <div className="player-name-row">
        <label>
          当前名字
          <input
            name="playerName"
            defaultValue={name}
            placeholder="还没有玩家进入"
            maxLength={40}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          保存名字
        </button>
      </div>
    </form>
  );
}
function SettingsForm({
  settings,
  pending,
  save,
  busy,
}: {
  settings: Settings;
  pending: boolean;
  save: (settings: Required<Settings>) => Promise<boolean>;
  busy: boolean;
}) {
  const [rewards, setRewards] = useState(settings.rewards);
  const numericFields: {
    key: keyof Settings;
    label: string;
    min: number;
    max: number;
  }[] = [
    { key: "applications", label: "每日申请最低份数", min: 1, max: 100 },
    { key: "contacts", label: "每日联系最低人数", min: 1, max: 1000 },
    {
      key: "episodes",
      label: "每天看剧集数（必须刚好，0 为不要求）",
      min: 0,
      max: 5,
    },
    { key: "bonusApplications", label: "申请加分门槛", min: 1, max: 100 },
    { key: "bonusContacts", label: "联系加分门槛", min: 1, max: 1000 },
    { key: "basePoints", label: "达标基础积分", min: 1, max: 1000 },
    { key: "bonusPoints", label: "每项加分积分", min: 0, max: 1000 },
    { key: "penaltyAmount", label: "漏打卡罚金（美元）", min: 1, max: 1000 },
    {
      key: "penaltyThreshold",
      label: "请客基金兑换门槛（美元）",
      min: 1,
      max: 10000,
    },
  ];
  return (
    <>
      {pending && (
        <div className="info-banner">
          <Clock3 size={18} />{" "}
          修改已保存，将于下一训练日开始时生效。当天规则保持原样。
        </div>
      )}
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const s = {
            ...settings,
            rewards,
            closeHour: Number(form.get("closeHour")),
            schedule: settings.schedule.map((_, i) =>
              String(form.get(`schedule-${i}`)),
            ),
          } as Required<Settings>;
          for (const field of numericFields)
            (s as unknown as Record<string, unknown>)[field.key] = Number(
              form.get(field.key),
            );
          s.study = {
            ...(Object.fromEntries(
              [...STUDY_FIELDS, ...STUDY_DETECTION].map((f) => [
                f.key,
                Number(form.get(`study-${f.key}`)),
              ]),
            ) as Omit<StudyRules, "strict">),
            strict: form.get("study-strict") === "on",
          };
          void save(s);
        }}
      >
        <section className="white-panel">
          <SectionHeading
            title="每天的小目标"
            note="最低目标需全部完成。两项超额目标各获得一次加分。"
          />
          <div className="settings-fields">
            {numericFields.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  name={f.key}
                  min={f.min}
                  max={f.max}
                  defaultValue={settings[f.key] as number}
                  required
                />
              </label>
            ))}
          </div>
        </section>
        <section className="white-panel">
          <SectionHeading
            title="训练日与出题安排"
            note="时区固定为 America/New_York，自动处理夏令时。"
          />
          <label className="close-hour-label">
            一天的结算时间（纽约本地时间）
            <select name="closeHour" defaultValue={settings.closeHour}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <div className="schedule-settings">
            {[1, 2, 3, 4, 5, 6, 0].map((w) => (
              <label key={w}>
                {["周日", "周一", "周二", "周三", "周四", "周五", "周六"][w]}
                <select
                  name={`schedule-${w}`}
                  defaultValue={settings.schedule[w]}
                >
                  {[
                    "ML",
                    "AI/LLM",
                    "SQL",
                    "Python",
                    "Project",
                    "Alternate",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c === "Project"
                        ? "项目深挖"
                        : c === "Alternate"
                          ? "SQL / Python 隔周轮换"
                          : c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="form-hint">
            修改结算时刻会缩短或延长下一训练日的过渡时段。已开始日期的截止时刻不会变化。
          </p>
        </section>
        <section className="white-panel">
          <SectionHeading
            title="值得期待的奖励"
            note="每个里程碑首次达成时解锁，并全屏庆祝。"
          />
          <div className="reward-settings">
            {rewards.map((r, i) => (
              <div key={i}>
                <label>
                  连胜天数
                  <input
                    aria-label={`奖励 ${i + 1} 连胜天数`}
                    type="number"
                    min={1}
                    max={365}
                    value={r.streak}
                    required
                    onChange={(e) =>
                      setRewards(
                        rewards.map((v, j) =>
                          i === j
                            ? { ...v, streak: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  奖励内容
                  <input
                    aria-label={`奖励 ${i + 1} 内容`}
                    value={r.text}
                    maxLength={200}
                    required
                    onChange={(e) =>
                      setRewards(
                        rewards.map((v, j) =>
                          i === j ? { ...v, text: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除奖励 ${i + 1}`}
                  disabled={rewards.length <= 1}
                  onClick={() => setRewards(rewards.filter((_, j) => i !== j))}
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            type="button"
            disabled={rewards.length >= 10}
            onClick={() =>
              setRewards([
                ...rewards,
                {
                  streak: Math.max(...rewards.map((r) => r.streak)) + 7,
                  text: "",
                },
              ])
            }
          >
            <Plus size={16} /> 添加里程碑
          </button>
        </section>
        <section className="white-panel study-rules-fields">
          <SectionHeading
            title="学习模式（可选）"
            note="通过的学习在当天达标时额外加分；失败的罚金进请客基金。默认宽松：只有特别明显不在学习时才提醒，几次提醒折合 1 次违规。"
          />
          <StudyInputs
            fields={STUDY_FIELDS}
            rules={withDefaults(settings.study)}
          />
          <label className="checkbox-label strict-toggle">
            <input
              type="checkbox"
              name="study-strict"
              defaultChecked={withDefaults(settings.study).strict}
            />{" "}
            严格模式：离开镜头和看手机直接记违规，AI 把握 70% 以上就记违规
          </label>
          <details>
            <summary>检测灵敏度</summary>
            <StudyInputs
              fields={STUDY_DETECTION}
              rules={withDefaults(settings.study)}
            />
          </details>
        </section>
        <div className="settings-footer">
          <p>
            <Snowflake size={16} /> 冻结卡每周一自动补充 1 张，最多持有 2 张。
          </p>
          <button className="button primary" disabled={busy}>
            保存挑战设置
          </button>
        </div>
      </form>
    </>
  );
}
