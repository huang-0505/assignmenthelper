"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Briefcase, FileText, Search, Users } from "lucide-react";
import { weekKey } from "@/lib/engine";
import type { Day } from "@/lib/types";
import { JdButton, JdEditor } from "./job-description";
import { useGame } from "./provider";

type Entry = Day["logs"][number] & { date: string };
const nyTime = (at: string) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Everything she has sent out, newest first, with the job description she saved alongside it. */
export function Applications() {
  const { snapshot } = useGame(),
    { state, today, role } = snapshot;
  const [kind, setKind] = useState<"application" | "contact">("application"),
    [query, setQuery] = useState(""),
    [onlyJd, setOnlyJd] = useState(false),
    [editing, setEditing] = useState<Entry | null>(null);
  const all = useMemo(
    () =>
      Object.values(state.days)
        .flatMap((day) => day.logs.map((log) => ({ ...log, date: day.date })))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [state.days],
  );
  const mine = all.filter((entry) => entry.kind === kind);
  const text = query.trim().toLowerCase();
  const shown = mine.filter(
    (entry) =>
      (!onlyJd || entry.jd) &&
      (!text || entry.company.toLowerCase().includes(text)),
  );
  const totals = {
    count: mine.reduce((sum, entry) => sum + entry.count, 0),
    week: mine
      .filter((entry) => weekKey(entry.date) === weekKey(today))
      .reduce((sum, entry) => sum + entry.count, 0),
    jd: mine.filter((entry) => entry.jd).length,
  };
  const days = [...new Set(shown.map((entry) => entry.date))];
  const applications = kind === "application";
  const unit = applications ? "份" : "人";
  return (
    <>
      <div className="page-title">
        <div>
          <p className="date-line">投递记录</p>
          <h1>
            你发出去的每一份
            <span className="title-dot" />
          </h1>
        </div>
      </div>
      <div className="stat-strip">
        <div>
          <span className="task-icon peach">
            {applications ? <Briefcase size={23} /> : <Users size={23} />}
          </span>
          <p>累计{applications ? "投递" : "联系"}</p>
          <strong>
            {totals.count}
            <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span className="task-icon blue">
            <Search size={23} />
          </span>
          <p>本周</p>
          <strong>
            {totals.week}
            <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span className="task-icon yellow">
            <FileText size={23} />
          </span>
          <p>存了 JD</p>
          <strong>
            {totals.jd}
            <small>条</small>
          </strong>
        </div>
      </div>
      <section className="white-panel application-list">
        <div className="section-heading">
          <div>
            <h2>{applications ? "投递过的岗位" : "联系过的人"}</h2>
            <p>
              {role === "referee"
                ? "她记录的每一条，按时间倒序。"
                : "面试前回来翻一翻：JD 里写的要求，就是他们会问的问题。"}
            </p>
          </div>
        </div>
        <div className="application-tools">
          <div className="filter-tabs" aria-label="记录类型">
            {(
              [
                ["application", "投递"],
                ["contact", "联系人"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={kind === value}
                className={kind === value ? "active" : ""}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="application-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜公司或备注"
              aria-label="搜公司或备注"
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyJd}
              onChange={(e) => setOnlyJd(e.target.checked)}
            />{" "}
            只看有 JD 的
          </label>
        </div>
        {shown.length === 0 ? (
          <div className="empty-state">
            <Briefcase size={30} />
            <h3>{mine.length ? "没有符合的记录" : "还没有记录"}</h3>
            <p>
              {mine.length
                ? "换个关键词，或者取消筛选。"
                : `在今日挑战里点「记录」，${applications ? "投递" : "联系"}就会出现在这里。`}
            </p>
          </div>
        ) : (
          <ol className="application-days">
            {days.map((date) => (
              <li key={date}>
                <h3>
                  {date === today ? "今天" : date}
                  <small>
                    {shown
                      .filter((entry) => entry.date === date)
                      .reduce((sum, entry) => sum + entry.count, 0)}{" "}
                    {unit}
                  </small>
                </h3>
                <ul>
                  {shown
                    .filter((entry) => entry.date === date)
                    .map((entry) => (
                      <li key={entry.id}>
                        <time>{nyTime(entry.at)}</time>
                        <span className="application-name">
                          {entry.company || (
                            <em>未填写{applications ? "公司" : "备注"}</em>
                          )}
                          {entry.count > 1 && <b>+{entry.count}</b>}
                        </span>
                        {entry.link && (
                          <a
                            href={entry.link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`打开 ${entry.company || "记录"} 的链接`}
                          >
                            <ArrowUpRight size={15} />
                          </a>
                        )}
                        {entry.jd ? (
                          <JdButton
                            logId={entry.id}
                            label="看 JD"
                            onEdit={
                              role === "player"
                                ? () => setEditing(entry)
                                : undefined
                            }
                          />
                        ) : (
                          applications &&
                          role === "player" && (
                            <button
                              className="small-button"
                              onClick={() => setEditing(entry)}
                            >
                              <FileText size={14} /> 加 JD
                            </button>
                          )
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
      {editing && (
        <JdEditor
          logId={editing.id}
          date={editing.date}
          company={editing.company}
          hasJd={Boolean(editing.jd)}
          close={() => setEditing(null)}
        />
      )}
    </>
  );
}
