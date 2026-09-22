"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Flag,
  Flame,
  Gift,
  Lightbulb,
  LockKeyhole,
  Mic,
  Minus,
  Plus,
  Send,
  Snowflake,
  Sparkles,
  Star,
  Trash2,
  Tv,
  Users,
  Zap,
} from "lucide-react";
import {
  bqDone,
  categoryFor,
  completedBq,
  episodesDone,
  finalScore,
  latestAnswer,
  requirements,
  weekKey,
} from "@/lib/engine";
import type { Day, Question } from "@/lib/types";
import data from "../../data/bq.json";
import { useGame } from "./provider";
import { Modal, Progress, SectionHeading, Status } from "./ui";
const bank = data as Question[];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function Today() {
  const { snapshot } = useGame(),
    { state, today, summary } = snapshot;
  const day = state.days[today],
    req = requirements(day),
    current = summary.days.find((d) => d.date === today)!;
  const date = new Date(`${today}T12:00:00Z`),
    remaining = Math.max(
      0,
      Math.round(
        (Date.parse(day.closesAt) - Date.parse(snapshot.serverTime)) / 60000,
      ),
    );
  const bqTotal = [...completedBq(state).values()].reduce(
    (n, p) => n + Number(Boolean(p.draft)) + Number(Boolean(p.practice)),
    0,
  );
  if (snapshot.role === "referee")
    return (
      <div className="access-message">
        <ShieldNotice />
        <h1>今天也一起加油</h1>
        <p>你当前是裁判，可以查看每天的答案、审核评分和设置奖励。</p>
        <Link className="button primary" href="/referee">
          打开裁判工作台
        </Link>
      </div>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <p className="date-line">
            {date.getUTCFullYear()} 年 {date.getUTCMonth() + 1} 月{" "}
            {date.getUTCDate()} 日，{weekdays[date.getUTCDay()]}
          </p>
          <h1>
            今日挑战
            <span className="title-dot" />
          </h1>
        </div>
        <div className="time-left">
          <Clock3 size={16} />
          <span>
            本日剩余{" "}
            <strong>
              {Math.floor(remaining / 60)}h {remaining % 60}m
            </strong>
          </span>
        </div>
      </div>
      {summary.pool >= state.settings.penaltyThreshold && (
        <div className="penalty-banner">
          <Gift />
          <div>
            <strong>请裁判吃饭</strong>
            <span>罚金池已累计 ${summary.pool}，一起吃顿饭，再整装出发。</span>
          </div>
        </div>
      )}
      <section className="quest-hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <Flag size={14} /> 通往 Data Scientist 的下一站
          </span>
          <h2>
            今天，也离 Offer
            <br />
            更近一步。
          </h2>
          <p>
            把大目标拆成小胜利。
            <br className="mobile-only" />
            今天的努力，未来的你会记得。
          </p>
          <div className="hero-progress">
            <div>
              <span>今日任务进度</span>
              <strong>
                {req.completed}
                <small> / {req.required}</small>
              </strong>
            </div>
            <Progress
              value={(req.completed / req.required) * 100}
              label="今日任务进度"
            />
            <span>
              {req.met
                ? "今日最低目标全部完成，做得很好！"
                : `还有 ${req.required - req.completed} 项任务，稳稳向前。`}
            </span>
          </div>
        </div>
        <Journey
          streak={summary.streak}
          milestones={day.settings.rewards.map((r) => r.streak)}
        />
      </section>
      <div className="today-layout">
        <div className="task-column">
          <section className="daily-section">
            <SectionHeading
              title="今日任务"
              note="完成全部最低目标，点亮今天。"
            >
              <span className="points-tag">
                <Zap size={14} fill="currentColor" /> +{day.settings.basePoints}{" "}
                积分
              </span>
            </SectionHeading>
            <div className="outreach-grid">
              <CountTask kind="application" day={day} />
              <CountTask kind="contact" day={day} />
            </div>
          </section>
          <Interview key={`answer-${today}`} day={day} />
          <Bq key={`bq-${today}`} day={day} />
          <English key={`english-${today}`} day={day} />
          <div className="day-bottom">
            <Status status={current.status} />
            <span>
              按纽约时间 {String(day.settings.closeHour).padStart(2, "0")}:00
              结算，完整达标才算成功。
            </span>
          </div>
        </div>
        <aside className="right-rail">
          <RewardRail />
          <div className="freeze-panel">
            <span className="freeze-icon">
              <Snowflake size={25} />
            </span>
            <div>
              <strong>你的连胜保护</strong>
              <p>
                冻结卡 <b>{summary.freezes}</b> / 2 张
              </p>
            </div>
            <span className="freeze-count">×{summary.freezes}</span>
            <p className="freeze-note">
              每周自动获得 1 张。漏打卡时自动使用，保住已有连胜。
            </p>
          </div>
          <section className="weekly-section">
            <SectionHeading title="本周训练安排" />
            <div className="schedule-list">
              {[1, 2, 3, 4, 5, 6, 0].map((w, i) => {
                const dateKey = new Date(`${weekKey(today)}T12:00:00Z`);
                dateKey.setUTCDate(dateKey.getUTCDate() + i);
                const d = dateKey.toISOString().slice(0, 10);
                const result = summary.days.find((day) => day.date === d);
                return (
                  <div className={d === today ? "current" : ""} key={w}>
                    <span>{weekdays[w]}</span>
                    <strong>
                      {categoryFor(d, day.settings) === "Project"
                        ? "项目深挖"
                        : categoryFor(d, day.settings)}
                    </strong>
                    {d === today ? (
                      <span className="today-dot">今天</span>
                    ) : result?.status === "met" ||
                      result?.status === "gold" ? (
                      <Check size={16} />
                    ) : (
                      <span className="schedule-dot" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <div className="bq-journey">
            <div>
              <Mic size={18} />
              <strong>BQ 故事库</strong>
              <span>{summary.bqCompleted} / 12</span>
            </div>
            <Progress
              value={(bqTotal / 24) * 100}
              label="BQ 阶段进度"
              tone="green"
            />
            <p>已完成 {bqTotal} / 24 个阶段。每个好故事，都值得被听见。</p>
          </div>
          <div className="tiny-quote">
            <span>“</span>
            <p>
              不必等到准备好了再开始。
              <br />
              开始了，才会准备好。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function ShieldNotice() {
  return <Flag size={40} />;
}
function Journey({
  streak,
  milestones,
}: {
  streak: number;
  milestones: number[];
}) {
  const targets = [...milestones].sort((a, b) => a - b).slice(0, 3);
  return (
    <div
      className="journey-art"
      aria-label={`奖励路线：${targets.join("、")} 天里程碑，当前连胜 ${streak} 天`}
      role="img"
    >
      <svg viewBox="0 0 440 280" aria-hidden="true">
        <defs>
          <pattern
            id="dots"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="#c5d5f4" />
          </pattern>
          <linearGradient id="token" x1="0" y1="0" x2="0.9" y2="1">
            <stop stopColor="#ffdf78" />
            <stop offset="1" stopColor="#f3b942" />
          </linearGradient>
        </defs>
        <rect width="440" height="280" fill="url(#dots)" />
        <ellipse cx="298" cy="228" rx="104" ry="17" fill="#dbe4f8" />
        <path
          d="M56 237 C70 160 164 240 188 177 S298 214 304 133 S373 115 380 59"
          fill="none"
          stroke="#c6d5f3"
          strokeWidth="38"
          strokeLinecap="round"
        />
        <path
          d="M56 231 C70 154 164 234 188 171 S298 208 304 127 S373 109 380 53"
          fill="none"
          stroke="#fff"
          strokeWidth="30"
          strokeLinecap="round"
        />
        <path
          d="M56 231 C70 154 164 234 188 171 S298 208 304 127 S373 109 380 53"
          fill="none"
          stroke="#b7c8ed"
          strokeWidth="2"
          strokeDasharray="5 8"
        />
        <g transform="translate(188 166)">
          <ellipse cy="13" rx="28" ry="13" fill="#d3a737" />
          <ellipse cy="7" rx="28" ry="13" fill="#ffde7d" />
          <ellipse rx="28" ry="13" fill="#ffeaa3" />
          <text
            textAnchor="middle"
            y="5"
            fill="#7c5a10"
            fontSize="16"
            fontWeight="800"
          >
            {targets[0] ?? 7}
          </text>
        </g>
        <g transform="translate(303 121)">
          <ellipse cy="10" rx="25" ry="12" fill="#b6c4e4" />
          <ellipse rx="25" ry="12" fill="#e7edf9" />
          <text
            textAnchor="middle"
            y="5"
            fill="#657592"
            fontSize="15"
            fontWeight="800"
          >
            {targets[1] ?? "★"}
          </text>
        </g>
        <g transform="translate(380 46)">
          <ellipse cy="12" rx="25" ry="12" fill="#b6c4e4" />
          <ellipse rx="25" ry="12" fill="#e7edf9" />
          <path
            d="M0 0V-38L22-30 0-20"
            stroke="#365ae8"
            strokeWidth="3"
            fill="#8ca5ff"
          />
          <text
            textAnchor="middle"
            y="5"
            fill="#657592"
            fontSize="14"
            fontWeight="800"
          >
            {targets[2] ?? "★"}
          </text>
        </g>
        <g transform="translate(95 160) rotate(-10)">
          <path
            d="M0-50 17-22 48-17 28 8 31 41 0 30-31 41-28 8-48-17-17-22Z"
            fill="#d6a136"
            transform="translate(0 7)"
          />
          <path
            d="M0-50 17-22 48-17 28 8 31 41 0 30-31 41-28 8-48-17-17-22Z"
            fill="url(#token)"
            stroke="#fff0b3"
            strokeWidth="3"
          />
          <ellipse cx="-10" cy="-3" rx="3" ry="5" fill="#684f26" />
          <ellipse cx="10" cy="-3" rx="3" ry="5" fill="#684f26" />
          <path
            d="M-7 10Q0 17 7 10"
            fill="none"
            stroke="#684f26"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <path d="m220 75 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#7996ed" />
        <path d="m346 210 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#f5c752" />
        <circle cx="147" cy="60" r="5" fill="#ffb99c" />
      </svg>
      <div className="journey-tag">
        <Flame size={16} fill="currentColor" /> 连胜 {streak} 天，继续前进！
      </div>
    </div>
  );
}
function CountTask({
  kind,
  day,
}: {
  kind: "application" | "contact";
  day: Day;
}) {
  const [open, setOpen] = useState(false),
    { act, busy } = useGame();
  const applications = kind === "application",
    count = applications ? day.applications : day.contacts;
  const minimum = applications
      ? day.settings.applications
      : day.settings.contacts,
    bonus = applications
      ? day.settings.bonusApplications
      : day.settings.bonusContacts;
  const title = applications ? "投递申请" : "联系新朋友",
    Icon = applications ? Send : Users,
    done = count >= minimum;
  return (
    <>
      <div
        className={`count-task ${applications ? "peach" : "blue"} ${done ? "done" : ""}`}
      >
        <div className="count-task-heading">
          <span className="task-icon">
            <Icon size={21} />
          </span>
          <h3>{title}</h3>
          {done && (
            <span className="check-badge" aria-label="已达标">
              <Check size={15} />
            </span>
          )}
        </div>
        <div className="count-display">
          <strong>{count}</strong>
          <span>
            / {minimum} {applications ? "份" : "人"}
          </span>
        </div>
        <Progress
          value={(count / minimum) * 100}
          label={title}
          tone={applications ? "orange" : ""}
        />
        <p>
          {done
            ? "最低目标完成，继续可以加分"
            : `再${applications ? "投递" : "联系"} ${minimum - count} ${applications ? "份" : "人"}，就能点亮这项任务`}
        </p>
        <div className="count-task-footer">
          <span>
            <Star size={13} /> {bonus} {applications ? "份" : "人"}额外 +
            {day.settings.bonusPoints}
          </span>
          <button className="small-button" onClick={() => setOpen(true)}>
            <Plus size={16} /> 记录
          </button>
        </div>
      </div>
      {open && (
        <Modal title={`记录${title}`} close={() => setOpen(false)}>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (
                await act({
                  type: "log",
                  date: day.date,
                  kind,
                  count: Number(form.get("count")),
                  company: String(form.get("company") || ""),
                  link: String(form.get("link") || ""),
                })
              )
                setOpen(false);
            }}
          >
            <label>
              本次新增{applications ? "申请数" : "联系人数"}
              <input
                name="count"
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
                required
                autoFocus
              />
            </label>
            <label>
              公司 / 备注 <span className="optional">可选</span>
              <input
                name="company"
                maxLength={200}
                placeholder={
                  applications
                    ? "例如：Notion · Data Scientist"
                    : "例如：校友、招聘人员、行业朋友"
                }
              />
            </label>
            <label>
              链接 <span className="optional">可选</span>
              <input
                name="link"
                type="url"
                placeholder="https://…"
                maxLength={1000}
              />
            </label>
            <button className="button primary full" disabled={busy}>
              保存记录
            </button>
          </form>
          {day.logs.filter((l) => l.kind === kind).length > 0 && (
            <div className="recent-logs">
              <h3>今天的记录</h3>
              {day.logs
                .filter((l) => l.kind === kind)
                .map((log) => (
                  <div key={log.id}>
                    <span>
                      <b>+{log.count}</b> {log.company || title}
                      {log.link && (
                        <a
                          href={log.link}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="打开记录链接"
                        >
                          <ArrowUpRight size={15} />
                        </a>
                      )}
                    </span>
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`删除${log.company || title}记录`}
                      onClick={() =>
                        act({
                          type: "removeLog",
                          date: day.date,
                          logId: log.id,
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
function useDraft(key: string, initial = "") {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (text: string) => {
      setValue(text);
      try {
        localStorage.setItem(key, text);
      } catch {
        /* Editing remains available if local storage is full. */
      }
    },
  ] as const;
}
function Interview({ day }: { day: Day }) {
  const { act, busy, snapshot } = useGame(),
    answer = latestAnswer(day),
    score = finalScore(answer);
  const [text, setText] = useDraft(
      `oq-${snapshot.mode}-answer-${day.date}`,
      answer?.text ?? "",
    ),
    [showRubric, setShowRubric] = useState(false);
  const pending = Boolean(answer && score === null),
    done = (score ?? 0) >= 3;
  return (
    <section className={`interview-section ${done ? "task-complete" : ""}`}>
      <div className="interview-top">
        <span className="task-icon lavender">
          <Code2 size={22} />
        </span>
        <div>
          <h2>每日面试题</h2>
          <p>练习表达，也练习思考。</p>
        </div>
        <span className="task-status">
          {done ? (
            <>
              <Check size={14} /> 已完成
            </>
          ) : pending ? (
            "待裁判审核"
          ) : (
            "今日必做"
          )}
        </span>
      </div>
      {day.question ? (
        <>
          <div className="question-meta">
            <span className="category-chip">{day.question.category}</span>
            <span>
              {
                { Easy: "基础", Medium: "进阶", Hard: "挑战" }[
                  day.question.difficulty
                ]
              }
            </span>
            <span>
              {day.question.id.startsWith("project-")
                ? "专属项目追问"
                : day.question.id.toUpperCase()}
            </span>
          </div>
          <h3 className="english-question" lang="en">
            {day.question.prompt}
          </h3>
          {day.question.schema && (
            <details className="schema">
              <summary>查看数据表结构</summary>
              <pre lang="en">{day.question.schema}</pre>
            </details>
          )}
          <button
            className="rubric-toggle"
            aria-expanded={showRubric}
            onClick={() => setShowRubric(!showRubric)}
          >
            <Lightbulb size={16} /> 思考提示{" "}
            <ChevronDown size={14} className={showRubric ? "rotated" : ""} />
          </button>
          {showRubric && (
            <ul className="rubric-list" lang="en">
              {day.question.rubric.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act({ type: "answer", date: day.date, text });
            }}
          >
            <label className="answer-label" htmlFor="interview-answer">
              你的回答<span>支持中文或英文作答</span>
            </label>
            <textarea
              id="interview-answer"
              value={text}
              onChange={(e) => setText(e.target.value)}
              minLength={20}
              maxLength={16000}
              rows={7}
              placeholder="Start with your approach, then explain the why…&#10;写下你的思路、权衡和例子。"
              required
            />
            <div className="answer-footer">
              <span>
                <LockKeyhole size={12} /> 草稿保存在本机{" "}
                <small>{text.length} / 16000</small>
              </span>
              <button
                className="button primary"
                disabled={
                  busy ||
                  pending ||
                  day.answers.length >= 5 ||
                  text.trim().length < 20
                }
              >
                <Sparkles size={16} />
                {busy
                  ? "正在保存与评审…"
                  : pending
                    ? "等待裁判审核"
                    : answer
                      ? "提交修改后的回答"
                      : "提交 AI 评审"}
              </button>
            </div>
            <p className="grading-note">
              3 / 5 分即达标 · 每天最多 5 次提交 · AI 暂不可用时由裁判审核
            </p>
          </form>
          {answer && (
            <div
              className={`feedback ${pending ? "pending" : done ? "passed" : "revise"}`}
              role="status"
            >
              <div>
                <strong>
                  {pending ? "答案已保存，等待裁判" : `本次评审 ${score} / 5`}
                </strong>
                <span>
                  {answer.override
                    ? "裁判最终评分"
                    : answer.grade.model || "人工审核"}
                </span>
              </div>
              <p>{answer.override?.reason || answer.grade.tip}</p>
              {answer.grade.missing.length > 0 && (
                <>
                  <small>可以补充的要点</small>
                  <ul>
                    {answer.grade.missing.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {done && day.question.expectedQuery && (
            <details className="schema">
              <summary>查看参考查询（可能有其他正确写法）</summary>
              <pre>{day.question.expectedQuery}</pre>
            </details>
          )}
        </>
      ) : (
        <div className="empty-state">
          <BookOpen size={30} />
          <h3>让今天的追问，来自你的真实项目</h3>
          <p>录入项目背景、方法和指标，我们就能生成有针对性的追问。</p>
          <Link href="/projects" className="button primary">
            录入我的项目
          </Link>
        </div>
      )}
    </section>
  );
}
function Bq({ day }: { day: Day }) {
  const { act, busy, snapshot } = useGame(),
    task = day.bq;
  const [text, setText] = useDraft(
      `oq-${snapshot.mode}-bq-${day.date}`,
      task?.text ?? "",
    ),
    [practiced, setPracticed] = useState(task?.practiced ?? false);
  const [expanded, setExpanded] = useState(false),
    [retellId, setRetellId] = useState("bq-01");
  const q = bank.find((q) => q.id === task?.questionId),
    done = bqDone(task);
  const alreadyRetold = Object.values(snapshot.state.days).some(
    (d) => d.retell?.practiced && weekKey(d.date) === weekKey(day.date),
  );
  return (
    <section className="bq-section">
      <div className="bq-header">
        <span className="task-icon green">
          <Mic size={23} />
        </span>
        <div>
          <h2>{task ? "把经历，讲成好故事" : "你的 12 个故事，已全部就绪"}</h2>
          <p>
            {task
              ? `BQ ${task.questionId.split("-")[1]} / 12 · ${task.stage === 1 ? "阶段一：写 STAR 草稿" : "阶段二：开口练习"}`
              : "BQ 已从每日最低要求中移除。每周复述一次，可以额外加分。"}
          </p>
        </div>
        {task && (
          <button
            className="icon-button"
            aria-label={expanded ? "收起 BQ 练习" : "展开 BQ 练习"}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {done ? (
              <Check size={21} />
            ) : (
              <ChevronDown size={21} className={expanded ? "rotated" : ""} />
            )}
          </button>
        )}
      </div>
      {task && q ? (
        <>
          <p className="bq-prompt" lang="en">
            {q.prompt}
          </p>
          {!expanded && (
            <div className="bq-preview-footer">
              <span>
                {done
                  ? "今日练习已完成"
                  : task.stage === 1
                    ? "Situation → Task → Action → Result"
                    : "先大声讲一次，再勾选完成"}
              </span>
              <button className="text-button" onClick={() => setExpanded(true)}>
                {done ? "查看练习" : "开始练习"}
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          {expanded && (
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act({ type: "bq", date: day.date, text, practiced });
              }}
            >
              <label>
                {task.stage === 1
                  ? "你的 STAR 草稿"
                  : "回顾草稿，或粘贴修订版（可选）"}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  maxLength={16000}
                  minLength={task.stage === 1 ? 40 : undefined}
                  required={task.stage === 1}
                  placeholder="Situation: …&#10;Task: …&#10;Action: …&#10;Result: …"
                />
              </label>
              {task.stage === 2 && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={practiced}
                    onChange={(e) => setPracticed(e.target.checked)}
                    required
                  />{" "}
                  我已经大声完整回答了一遍
                </label>
              )}
              <button className="button primary" disabled={busy}>
                {done
                  ? "保存练习修改"
                  : task.stage === 1
                    ? "保存草稿，完成今日阶段"
                    : "确认完成口述练习"}
              </button>
              <p className="muted small">
                草稿与口述安排在不同日期，每天只需完成一个阶段。
              </p>
            </form>
          )}
        </>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              type: "retell",
              date: day.date,
              questionId: retellId,
              text,
              practiced: true,
            });
          }}
        >
          <label>
            本周想复述哪个故事？
            <select
              value={retellId}
              onChange={(e) => setRetellId(e.target.value)}
            >
              {bank
                .filter((q) => q.category === "BQ")
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.id.toUpperCase()} · {q.prompt}
                  </option>
                ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" required /> 我已经大声复述了这个故事
          </label>
          <button className="button primary" disabled={busy || alreadyRetold}>
            {alreadyRetold
              ? "本周复述已记录"
              : `记录每周复述 +${day.settings.bonusPoints} 积分`}
          </button>
        </form>
      )}
    </section>
  );
}
function English({ day }: { day: Day }) {
  const { act, busy } = useGame(),
    target = day.settings.episodes ?? 0,
    saved = day.episodes ?? 0;
  const [count, setCount] = useState(saved),
    [note, setNote] = useState(day.episodeNote ?? "");
  if (!target) return null;
  return (
    <section className="bq-section english-section">
      <div className="bq-header">
        <span className="task-icon blue">
          <Tv size={23} />
        </span>
        <div>
          <h2>英语表达和听力</h2>
          <p>
            每天看 {target} 集英文电视剧：刚好 {target}{" "}
            集才算完成，多看、少看都不算。
          </p>
        </div>
        {episodesDone(day) && (
          <span className="check-badge" aria-label="已达标">
            <Check size={15} />
          </span>
        )}
      </div>
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act({ type: "episodes", date: day.date, count, note });
        }}
      >
        <div className="episode-stepper" role="group" aria-label="今天看了几集">
          <button
            type="button"
            className="icon-button"
            aria-label="少记一集"
            disabled={count <= 0}
            onClick={() => setCount(count - 1)}
          >
            <Minus size={18} />
          </button>
          <strong aria-live="polite">{count}</strong>
          <span>集</span>
          <button
            type="button"
            className="icon-button"
            aria-label="多记一集"
            disabled={count >= 20}
            onClick={() => setCount(count + 1)}
          >
            <Plus size={18} />
          </button>
        </div>
        <label>
          剧名 / 今天学到的表达 <span className="optional">可选</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="例如：Friends S01E03 · I'm on it."
          />
        </label>
        <p className={saved > target ? "form-error small" : "muted small"}>
          {saved === target
            ? `刚好 ${target} 集，今天的英语任务完成！`
            : saved > target
              ? `已记录 ${saved} 集，超过了 ${target} 集，今天的英语任务不算完成。`
              : saved
                ? `已记录 ${saved} 集，还差 ${target - saved} 集。`
                : `看完后记录为 ${target} 集并保存。`}
        </p>
        <button className="button primary" disabled={busy}>
          保存看剧记录
        </button>
      </form>
    </section>
  );
}
function RewardRail() {
  const { snapshot } = useGame(),
    { summary, state } = snapshot;
  const reward = [...state.settings.rewards]
    .sort((a, b) => a.streak - b.streak)
    .find((r) => !summary.rewards.some((earned) => earned.streak === r.streak));
  return (
    <section className="reward-panel">
      <div className="reward-panel-label">
        <Gift size={17} />
        <span>下一份小确幸</span>
        <Star size={16} />
      </div>
      <div className="gift-illustration" aria-hidden="true">
        <div className="gift-lid" />
        <div className="gift-box" />
        <div className="gift-ribbon" />
        <div className="gift-bow left" />
        <div className="gift-bow right" />
        <span className="gift-spark one">✦</span>
        <span className="gift-spark two">✦</span>
      </div>
      <h3>{reward ? reward.text : "所有里程碑奖励已解锁！"}</h3>
      <p>
        {reward ? (
          <>
            再坚持{" "}
            <strong>{Math.max(0, reward.streak - summary.streak)} 天</strong>
            ，解锁你的奖励
          </>
        ) : (
          "为一路坚持的自己喝彩。"
        )}
      </p>
      {reward && (
        <>
          <Progress
            value={(summary.streak / reward.streak) * 100}
            label="下一里程碑"
            tone="gold"
          />
          <div className="reward-progress-label">
            <span>连续 {summary.streak} 天</span>
            <span>{reward.streak} 天里程碑</span>
          </div>
        </>
      )}
      <Link href="/stats" className="reward-link">
        查看全部奖励
        <ChevronRight size={15} />
      </Link>
    </section>
  );
}
