"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  studyRewards,
  studyOutcome,
  COACH_MOODS,
  KIND_LABEL,
  SOURCE_LABEL,
  type CoachMood,
  type StudyStatus,
  type StudyView,
} from "@/lib/study";

export type ViewSession = StudyView["sessions"][number];
export type CoachEvent = {
  id: number;
  mood: CoachMood;
  tag?: string;
  detail?: string;
  /** Overrides the mood's saved line, e.g. what the referee typed for a live visit. */
  line?: string;
  inspecting?: boolean;
  /** The referee is at the door in person: the door always swings open. */
  visit?: boolean;
};

export function coachSrc(view: StudyView, mood: CoachMood) {
  const version = view.coach.photos[mood];
  return version ? `/api/study/media?coach=${mood}&v=${version}` : null;
}

function Silhouette({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 96" aria-hidden="true" className={className}>
      <circle cx="40" cy="38" r="17" />
      <path d="M8 96c2-22 15-33 32-33s30 11 32 33z" />
    </svg>
  );
}

/** The framed photo: settings slots, the poster and the referee's face picker. */
export function DoorWindow({
  src,
  mood,
  size = "md",
}: {
  src: string | null;
  mood: CoachMood;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`door-window ${mood} ${size}`}>
      <div className="door-glass">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, same-origin media route
          <img src={src} alt="" />
        ) : (
          <Silhouette className="door-silhouette" />
        )}
      </div>
    </div>
  );
}

export type DoorStage =
  "idle" | "approach" | "peek" | "window" | "wide" | "closing";
/**
 * Where the door settles for an event: an inspection peeks around it, good news is seen through
 * its window with the door shut again, and a caught lapse or the referee in person swings it open.
 */
function stageFor(event: CoachEvent): DoorStage {
  if (event.visit) return "wide";
  if (event.inspecting || event.mood === "calm") return "peek";
  return event.mood === "pleased" ? "window" : "wide";
}
const APPROACH_MS = 700,
  CLOSE_MS = 700;

/**
 * The classroom back door. Hinged on the left, it swings away into the corridor, so the coach
 * appears in the gap on the right; shut, she is seen through the small window. `still` shows a
 * face in the window with nothing happening, for the pages that only introduce the coach.
 */
export function Door({
  view,
  event = null,
  still,
}: {
  view: StudyView;
  event?: CoachEvent | null;
  still?: CoachMood;
}) {
  const [stage, setStage] = useState<DoorStage>(still ? "window" : "idle"),
    [shown, setShown] = useState<CoachEvent | null>(null),
    [seen, setSeen] = useState<CoachEvent | null>(null);
  // A new event moves the door at once; someone walks up to the window first unless it is open.
  if (!still && event !== seen) {
    setSeen(event);
    if (event) {
      setShown(event);
      setStage(
        stage === "idle" || stage === "closing" ? "approach" : stageFor(event),
      );
    } else if (stage !== "idle") setStage("closing");
  }
  // The timed steps: the approach settles into the event's stage, and closing ends idle.
  useEffect(() => {
    if (stage === "approach" && event) {
      const timer = setTimeout(() => setStage(stageFor(event)), APPROACH_MS);
      return () => clearTimeout(timer);
    }
    if (stage === "closing") {
      const timer = setTimeout(() => {
        setStage("idle");
        setShown(null);
      }, CLOSE_MS);
      return () => clearTimeout(timer);
    }
  }, [stage, event]);
  const mood = still ?? shown?.mood ?? "calm";
  return (
    <div className={`door-scene ${stage} ${mood}`}>
      <div className="door-frame">
        <div className="door-opening">
          <div className="door-coach">
            {COACH_MOODS.map((m) => {
              const src = coachSrc(view, m);
              const on = m === mood ? "on" : "";
              return src ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, same-origin media route
                <img key={m} src={src} alt="" className={on} />
              ) : (
                <Silhouette key={m} className={`door-silhouette ${on}`} />
              );
            })}
          </div>
        </div>
        <div className="door-leaf">
          <span className="door-wood">
            <i className="door-panel" />
          </span>
          <span className="door-mid">
            <i className="door-wood" />
            <span className="door-glass">
              <span className="door-shadow">
                <Silhouette />
              </span>
            </span>
            <i className="door-wood" />
          </span>
          <span className="door-wood">
            <i className="door-panel" />
          </span>
          <i className="door-knob" />
        </div>
      </div>
      {shown && !still && (
        <div className="coach-bubble" role="status" aria-live="polite">
          {shown.tag && <span className="coach-tag">{shown.tag}</span>}
          <strong>{shown.line ?? view.coach.lines[shown.mood]}</strong>
          {shown.detail && <p>{shown.detail}</p>}
          {shown.inspecting && (
            <span className="coach-checking">
              <i /> 查岗中
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StrikeMarks({ used, max }: { used: number; max: number }) {
  return (
    <div
      className="strike-marks"
      role="img"
      aria-label={`违规 ${used} / ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < used ? "hit" : ""} />
      ))}
    </div>
  );
}

const STAMP: Record<StudyStatus, string> = {
  passed: "通过",
  failed: "未通过",
  active: "进行中",
  paused: "暂停中",
  summary: "待总结",
};
export function Stamp({
  status,
  big = false,
}: {
  status: StudyStatus;
  big?: boolean;
}) {
  return (
    <span className={`study-stamp ${status} ${big ? "big" : ""}`}>
      {STAMP[status]}
    </span>
  );
}

export function nyTime(at: string, withDate = false) {
  return new Date(at).toLocaleString("zh-CN", {
    timeZone: "America/New_York",
    ...(withDate && { month: "numeric", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The settlement poster: what the session came to, in the coach's words. Snapshots appear only if she shared them. */
export function Poster({
  view,
  session,
  name,
}: {
  view: StudyView;
  session: ViewSession;
  name: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [busy, setBusy] = useState(false);
  const r = session.result,
    mood: CoachMood =
      r.status === "passed"
        ? "pleased"
        : r.status === "failed"
          ? "angry"
          : "calm";
  const counted = session.strikes.filter((s) => !s.overturnedAt),
    snapshots = session.share ? counted.filter((s) => s.hasSnapshot) : [];
  // The same lapse repeated reads as one line with a count, so the poster stays short.
  const grouped = [
    ...counted
      .reduce((map, s) => {
        const key = `${s.kind}|${s.source}|${s.reason}`;
        const entry = map.get(key) ?? { ...s, key, count: 0 };
        entry.count += 1;
        return map.set(key, entry);
      }, new Map<string, (typeof counted)[number] & { key: string; count: number }>())
      .values(),
  ];
  async function download() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      // Safari can paint the first capture before images decode; the second pass is complete.
      await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.href = url;
      link.download = `学习结算-${session.day}.png`;
      link.click();
    } catch {
      toast.error("记录单生成失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="poster-wrap">
      <div className="poster" ref={ref}>
        <header>
          <strong>学习结算单</strong>
          <span>
            {session.day.replaceAll("-", ".")} · {nyTime(session.startedAt)}{" "}
            开始
          </span>
        </header>
        <div className="poster-coach">
          <DoorWindow src={coachSrc(view, mood)} mood={mood} size="lg" />
          <p>“{view.coach.lines[mood]}”</p>
        </div>
        {session.goal && (
          <p className="poster-goal">
            <b>这场学的</b>
            {session.goal}
          </p>
        )}
        <dl className="poster-stats">
          <div>
            <dt>学习时长</dt>
            <dd>
              {r.studiedMinutes}
              <small> 分钟</small>
            </dd>
          </div>
          <div>
            <dt>违规</dt>
            <dd>
              {Math.min(r.effective, session.rules.maxStrikes)}
              <small>
                {" "}
                / {session.rules.maxStrikes}
                {r.effective > session.rules.maxStrikes &&
                  ` · 共 ${r.effective}`}
              </small>
            </dd>
          </div>
          <div>
            <dt>{session.visits.length ? "裁判来过" : "提醒"}</dt>
            <dd>
              {session.visits.length ? (
                <>
                  {session.visits.length}
                  <small> 次</small>
                </>
              ) : (
                r.warnings
              )}
            </dd>
          </div>
        </dl>
        {counted.length > 0 && (
          <ul className="poster-events">
            {grouped.map((g) => (
              <li key={g.key} className={g.kind}>
                <b>
                  {KIND_LABEL[g.kind]}
                  {g.count > 1 && ` ×${g.count}`}
                </b>
                {SOURCE_LABEL[g.source]} · {g.reason}
              </li>
            ))}
          </ul>
        )}
        {snapshots.length > 0 && (
          <div className="poster-snapshots">
            {snapshots.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element -- private, same-origin media route
              <img
                key={s.id}
                src={`/api/study/media?snapshot=${s.id}`}
                alt={s.reason}
              />
            ))}
          </div>
        )}
        <Stamp status={r.status} big />
        {r.status === "passed" && (
          <p className="session-reward">
            {studyRewards(
              view.sessions.map((s) => studyOutcome(s, view.serverTime)),
            ).some((o) => o.id === session.id)
              ? `本场奖励 ${session.rules.points} 积分 · 当天达标后计入总分`
              : "今日奖励次数已用完，本场不加分"}
          </p>
        )}
        <footer>{name} · Offer Quest 学习模式</footer>
      </div>
      <button className="button primary" onClick={download} disabled={busy}>
        <Download size={17} /> {busy ? "正在生成…" : "下载记录单 PNG"}
      </button>
    </div>
  );
}
