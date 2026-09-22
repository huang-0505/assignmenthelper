"use client";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
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
  inspecting?: boolean;
};

export function coachSrc(view: StudyView, mood: CoachMood) {
  const version = view.coach.photos[mood];
  return version ? `/api/study/media?coach=${mood}&v=${version}` : null;
}

/** The classroom back-door window the coach peeks through. */
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
          <svg
            viewBox="0 0 80 96"
            aria-hidden="true"
            className="door-silhouette"
          >
            <circle cx="40" cy="38" r="17" />
            <path d="M8 96c2-22 15-33 32-33s30 11 32 33z" />
          </svg>
        )}
      </div>
    </div>
  );
}

export function CoachOverlay({
  view,
  event,
}: {
  view: StudyView;
  event: CoachEvent | null;
}) {
  return (
    <div
      className={`coach-overlay ${event ? `in ${event.mood}` : ""}`}
      role="status"
      aria-live="polite"
    >
      {event && (
        <>
          <DoorWindow src={coachSrc(view, event.mood)} mood={event.mood} />
          <div className="coach-bubble">
            {event.tag && <span className="coach-tag">{event.tag}</span>}
            <strong>{view.coach.lines[event.mood]}</strong>
            {event.detail && <p>{event.detail}</p>}
            {event.inspecting && (
              <span className="coach-checking">
                <i /> 查岗中
              </span>
            )}
          </div>
        </>
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
            <dt>提醒</dt>
            <dd>{r.warnings}</dd>
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
        <footer>{name} · Offer Quest 学习模式</footer>
      </div>
      <button className="button primary" onClick={download} disabled={busy}>
        <Download size={17} /> {busy ? "正在生成…" : "下载记录单 PNG"}
      </button>
    </div>
  );
}
