"use client";
import "@fontsource-variable/caveat";
import Link from "next/link";
import { NetworkingLink } from "./networking-link";
import { WeeklyPlanCard } from "./weekly-plan";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  DoorOpen,
  Eye,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  STUDY_GOALS,
  STUDY_REWARD_LIMIT,
  studyPoints,
  studyRewards,
  studyOutcome,
  calibrate,
  COACH_MOOD_LABEL,
  COACH_MOODS,
  inspectionDelay,
  duration,
  KIND_LABEL,
  localKind,
  localReason,
  minuteChoices,
  SAMPLE_MS,
  SignalTracker,
  SOURCE_LABEL,
  VISIT_GAP_MS,
  type CoachMood,
  type LocalSource,
  type Pose,
  type Sample,
  type StudyRules,
  type StudyView,
  type StudyVisit,
  withDefaults,
} from "@/lib/study";
import {
  captureJpeg,
  loadDetector,
  ticker,
  type Detector,
} from "@/lib/study-detector";
import { knock, primeKnock } from "@/lib/sound";
import { useGame } from "./provider";
import { Modal } from "./ui";
import {
  coachSrc,
  Door,
  DoorWindow,
  nyTime,
  Poster,
  Stamp,
  StrikeMarks,
  type CoachEvent,
  type ViewSession,
} from "./study-parts";

type Loaded = { mode: "demo" } | { mode: "setup" } | StudyView;
type Inspection = {
  unavailable?: true;
  kind?: "strike" | "warning" | null;
  verdict?: { reason: string };
};
type Reply = StudyView & {
  inspection?: Inspection;
  grade?: { score: number | null; tip: string };
  deleted?: number;
  /** A live visit from the referee she has not seen yet, riding on a heartbeat reply. */
  visit?: StudyVisit;
};
type Post = (body: object, quiet?: boolean) => Promise<Reply | null>;

const KEYS = {
  consent: "offer-quest-study-consent",
  ai: "offer-quest-study-ai",
  screen: "offer-quest-study-screen",
  share: "offer-quest-study-share",
  baseline: "offer-quest-study-baseline",
  knock: "offer-quest-study-knock",
  selfView: "offer-quest-study-selfview",
};
// The tab title says when the coach is at the door, for the moments the page is behind her notes.
let pageTitle = "";
function flashTitle(text: string | null) {
  pageTitle ||= document.title;
  document.title = text ? `${text} · ${pageTitle}` : pageTitle;
}
const saved = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are a convenience; the session itself lives on the server. */
  }
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
function cameraProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError")
    return "没有摄像头权限。请在浏览器地址栏的网站设置里允许使用摄像头，然后再试一次。";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "没有找到可用的摄像头。请连接摄像头后再试一次。";
  if (name === "NotReadableError")
    return "摄像头正被其他应用占用。请关闭其他使用摄像头的应用后再试一次。";
  return "本机检测模型加载失败。请检查网络后再试一次。";
}

export function Study() {
  const { snapshot } = useGame();
  const [data, setData] = useState<Loaded | null>(null),
    [error, setError] = useState("");
  const offset = useRef(0);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/study", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      if (body.serverTime)
        offset.current = Date.parse(body.serverTime) - Date.now();
      setData(body);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败，请重试");
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const post: Post = useCallback(
    async (body, quiet = false) => {
      try {
        const res = await fetch("/api/study", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const reply = await res.json();
        if (!res.ok) {
          if (!quiet) toast.error(reply.error || "操作失败，请重试");
          if (res.status === 409) await load();
          return null;
        }
        offset.current = Date.parse(reply.serverTime) - Date.now();
        setData(reply);
        return reply;
      } catch {
        if (!quiet) toast.error("网络断开了，这一步没有保存");
        return null;
      }
    },
    [load],
  );
  const now = useCallback(() => Date.now() + offset.current, []);
  return (
    <div className="study">
      <div className="page-title">
        <div>
          <p className="date-line">选好目标，让这段时间有收获</p>
          <h1>
            学习模式
            <span className="title-dot" />
          </h1>
        </div>
      </div>
      {!data ? (
        <p className="muted study-loading">
          {error || (
            <>
              <LoaderCircle className="spin" size={16} /> 正在打开学习模式…
            </>
          )}
        </p>
      ) : data.mode === "demo" ? (
        <div className="access-message">
          <Camera size={36} />
          <h2>演示模式里没有学习模式</h2>
          <p>学习模式需要保存到数据库。连接 Supabase 后就能使用。</p>
        </div>
      ) : data.mode === "setup" ? (
        <div className="access-message">
          <Camera size={36} />
          <h2>学习模式还差一步</h2>
          <p>
            {snapshot.role === "referee"
              ? "请在 Supabase SQL Editor 里执行 supabase/migrations/002_study.sql，然后刷新这个页面。"
              : "裁判还没有完成学习模式的数据库设置。设置好之后刷新这个页面即可。"}
          </p>
        </div>
      ) : snapshot.role === "referee" ? (
        <RefereeStudy view={data} post={post} now={now} reload={load} />
      ) : (
        <PlayerStudy view={data} post={post} now={now} reload={load} />
      )}
    </div>
  );
}

type Phase =
  | "intro"
  | "explain"
  | "loading"
  | "calibrating"
  | "ready"
  | "reconnect"
  | "running"
  | "paused"
  | "summary"
  | "done";

function PlayerStudy({
  view,
  post,
  now,
  reload,
}: {
  view: StudyView;
  post: Post;
  now: () => number;
  reload: () => Promise<void>;
}) {
  const { snapshot, refresh } = useGame();
  const open = view.sessions.find((s) => !s.endedAt) ?? null;
  const [phase, setPhase] = useState<Phase>(() =>
    !open
      ? "intro"
      : open.result.status === "summary"
        ? "summary"
        : open.result.status === "paused"
          ? "paused"
          : "reconnect",
  );
  const [sessionId, setSessionId] = useState(open?.id ?? null),
    [posterId, setPosterId] = useState<string | null>(null);
  const session = view.sessions.find((s) => s.id === sessionId) ?? null;
  const [consent, setConsent] = useState(() => saved(KEYS.consent)),
    [consentOpen, setConsentOpen] = useState(false),
    [wantAi, setWantAi] = useState(() => saved(KEYS.ai) === "1"),
    [wantScreen, setWantScreen] = useState(() => saved(KEYS.screen) === "1"),
    [share, setShare] = useState(() => saved(KEYS.share) === "1"),
    [knockOn, setKnockOn] = useState(() => saved(KEYS.knock) === "1"),
    [bigCam, setBigCam] = useState(() => saved(KEYS.selfView) === "big"),
    [goal, setGoal] = useState(""),
    [goals, setGoals] = useState<string[]>(["自由学习"]),
    [minutes, setMinutes] = useState(
      minuteChoices().includes(view.rules.minutes as 20 | 30 | 45)
        ? view.rules.minutes
        : 30,
    );
  const combinedGoal = [...goals, goal.trim()].filter(Boolean).join("；");
  function toggleGoal(label: string) {
    const next = goals.includes(label)
      ? goals.filter((g) => g !== label)
      : [...goals.filter((g) => g !== "自由学习"), label];
    if ([...next, goal.trim()].filter(Boolean).join("；").length > 80) {
      toast.error("目标说明较长，请先缩短一点再添加目标");
      return;
    }
    setGoals(next);
  }
  const rewardLimit = view.rules.dailyRewardLimit ?? STUDY_REWARD_LIMIT;
  const rewardsToday = studyRewards(
    view.sessions.map((s) => studyOutcome(s, view.serverTime)),
  ).filter((o) => o.day === snapshot.today);
  const rewardRemaining = Math.max(0, rewardLimit - rewardsToday.length);
  const aiOn = Boolean(view.ai) && wantAi && consent === "yes";
  const [baseline, setBaseline] = useState<Pose | null>(() => {
    try {
      return JSON.parse(saved(KEYS.baseline) ?? "null");
    } catch {
      return null;
    }
  });
  const [cameraOn, setCameraOn] = useState(false),
    [screenOn, setScreenOn] = useState(false),
    [cameraLost, setCameraLost] = useState(false),
    [progress, setProgress] = useState(0),
    [problem, setProblem] = useState(""),
    [live, setLive] = useState<Sample | null>(null),
    [coach, setCoach] = useState<CoachEvent | null>(null),
    [aiDown, setAiDown] = useState(false),
    [struckSeen, setStruckSeen] = useState(false),
    [, setTick] = useState(0);

  const video = useRef<HTMLVideoElement | null>(null),
    screenVideo = useRef<HTMLVideoElement>(null),
    camera = useRef<MediaStream | null>(null),
    screen = useRef<MediaStream | null>(null),
    detector = useRef<Detector | null>(null),
    tracker = useRef<SignalTracker | null>(null),
    coachTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    startAfterConsent = useRef(false),
    seenVisits = useRef(new Set<string>()),
    visitUntil = useRef(0);
  // Timers read the latest values through refs so they never restart mid-session.
  const latest = useRef({
    session,
    share,
    cameraLost,
    aiDown,
    live,
    post,
    knockOn,
  });
  useEffect(() => {
    latest.current = {
      session,
      share,
      cameraLost,
      aiDown,
      live,
      post,
      knockOn,
    };
  });

  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
    if (el && camera.current && el.srcObject !== camera.current) {
      el.srcObject = camera.current;
      void el.play().catch(() => {});
    }
  }, []);
  const stopCamera = useCallback(() => {
    camera.current?.getTracks().forEach((t) => t.stop());
    camera.current = null;
    if (video.current) video.current.srcObject = null;
    setCameraOn(false);
  }, []);
  const stopAll = useCallback(() => {
    stopCamera();
    screen.current?.getTracks().forEach((t) => t.stop());
    screen.current = null;
    setScreenOn(false);
    clearTimeout(coachTimer.current);
    setCoach(null);
    flashTitle(null);
  }, [stopCamera]);
  useEffect(() => stopAll, [stopAll]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new DOMException("no camera API", "NotFoundError");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });
    camera.current = stream;
    stream
      .getVideoTracks()[0]
      ?.addEventListener("ended", () => setCameraLost(true));
    attach(video.current);
    setCameraLost(false);
    setCameraOn(true);
  }
  async function shareScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" } as MediaTrackConstraints,
        audio: false,
      });
      screen.current = stream;
      if (screenVideo.current) {
        screenVideo.current.srcObject = stream;
        void screenVideo.current.play().catch(() => {});
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screen.current = null;
        setScreenOn(false);
        toast("屏幕共享已停止，之后的检查只看摄像头");
      });
      setScreenOn(true);
    } catch {
      toast("没有共享屏幕，这次检查只看摄像头");
    }
  }
  function showCoach(event: Omit<CoachEvent, "id">, ms = 6500) {
    // The referee in person keeps the door; an automatic check meanwhile is still recorded below.
    if (!event.visit && Date.now() < visitUntil.current) return;
    clearTimeout(coachTimer.current);
    setCoach({ ...event, id: Date.now() });
    if (event.visit) visitUntil.current = Date.now() + ms;
    flashTitle(event.mood === "angry" ? "👀 教练在后门" : "🚪 教练来了");
    if (ms)
      coachTimer.current = setTimeout(() => {
        setCoach(null);
        flashTitle(null);
      }, ms);
  }
  // The referee opened the door in person: it stays open longer, and the referee learns she saw it.
  function arrive(visit: StudyVisit) {
    const { session: s, post: send, knockOn: sound } = latest.current;
    if (!s || seenVisits.current.has(visit.id)) return;
    seenVisits.current.add(visit.id);
    showCoach(
      { mood: visit.mood, line: visit.line, tag: "裁判来了", visit: true },
      10_000,
    );
    if (sound) knock();
    void send({ type: "visitSeen", sessionId: s.id, visitId: visit.id }, true);
  }

  function begin() {
    startAfterConsent.current = true;
    if (view.ai && wantAi && consent !== "yes") setConsentOpen(true);
    else setPhase("explain");
  }
  async function openCamera() {
    setProblem("");
    setPhase("loading");
    try {
      await startCamera();
      detector.current = await loadDetector();
      await runCalibration();
    } catch (e) {
      stopAll();
      setProblem(cameraProblem(e));
      setPhase("explain");
    }
  }
  async function runCalibration() {
    setPhase("calibrating");
    setProblem("");
    const poses: (Pose | null)[] = [];
    for (let i = 1; i <= 20; i++) {
      await wait(250);
      if (!video.current || !detector.current) return;
      poses.push(detector.current.sample(video.current).pose);
      setProgress(i / 20);
    }
    const result = calibrate(poses);
    if (!result) {
      setProblem("没看清你的脸。请坐到镜头正前方、确认光线充足，再校准一次。");
      return;
    }
    setBaseline(result);
    save(KEYS.baseline, JSON.stringify(result));
    setPhase("ready");
  }
  async function start() {
    // Audio may only start from a click; this is the click.
    if (knockOn) primeKnock();
    const reply = await post({
      type: "start",
      ai: aiOn,
      screen: aiOn && screenOn,
      share,
      goal: combinedGoal || "自由学习",
      minutes,
    });
    const s = reply?.sessions.find((x) => !x.endedAt);
    if (!s) return;
    tracker.current = new SignalTracker(withDefaults(s.rules), baseline);
    setSessionId(s.id);
    setStruckSeen(false);
    setAiDown(false);
    setPhase("running");
  }
  async function reconnect() {
    try {
      await startCamera();
      detector.current = await loadDetector();
    } catch (e) {
      stopAll();
      toast.error(cameraProblem(e));
      return;
    }
    tracker.current = new SignalTracker(withDefaults(session!.rules), baseline);
    setPhase("running");
  }
  const finish = useCallback(
    (id: string) => {
      stopAll();
      setPosterId(id);
      setPhase("done");
      void refresh();
    },
    [refresh, stopAll],
  );
  async function pause() {
    if (await post({ type: "pause", sessionId })) {
      stopCamera();
      setCoach(null);
      setPhase("paused");
    }
  }
  async function resume() {
    try {
      await startCamera();
    } catch (e) {
      toast.error(cameraProblem(e));
      return;
    }
    const reply = await post({ type: "resume", sessionId });
    const s = reply?.sessions.find((x) => x.id === sessionId);
    if (s && !s.endedAt) {
      if (!detector.current) detector.current = await loadDetector();
      tracker.current ??= new SignalTracker(withDefaults(s.rules), baseline);
      tracker.current.reset();
      setPhase("running");
    }
  }
  async function endEarly() {
    stopAll();
    await post({ type: "end", sessionId });
    finish(sessionId!);
  }
  async function submitSummary(text: string) {
    const reply = await post({ type: "finish", sessionId, summary: text });
    if (!reply) return;
    if (
      reply.sessions
        .find((x) => x.id === sessionId)
        ?.strikes.some((x) => x.source === "summary")
    )
      toast("这份总结记了 1 次提醒");
    finish(sessionId!);
  }
  async function report(source: LocalSource) {
    const { session: s, share: sharing, post: send } = latest.current;
    if (!s) return;
    const rules = withDefaults(s.rules),
      kind = localKind(source, rules);
    const snapshot =
      sharing && video.current ? captureJpeg(video.current, 320) : undefined;
    const reply = await send(
      {
        type: "event",
        sessionId: s.id,
        id: crypto.randomUUID(),
        source,
        snapshot,
      },
      true,
    );
    if (reply)
      showCoach({
        // Any recorded lapse shows the "caught you" face; the tag says how much it counts.
        mood: "angry",
        tag: kind === "strike" ? "违规 +1" : "提醒",
        detail: localReason(source, rules),
      });
  }
  async function inspect() {
    const { session: s, aiDown: down, post: send } = latest.current;
    if (!s || !video.current) return;
    showCoach({ mood: "calm", tag: "查岗", inspecting: true }, 0);
    // A failed AI check falls back to the camera for this inspection only; the next one tries again.
    if (s.layers.ai) {
      const cameraFrame = captureJpeg(video.current, 320);
      const screenFrame =
        screen.current && screenVideo.current
          ? captureJpeg(screenVideo.current, 960, 0.6)
          : undefined;
      const reply = cameraFrame
        ? await send(
            {
              type: "inspect",
              sessionId: s.id,
              camera: cameraFrame,
              screen: screenFrame,
            },
            true,
          )
        : null;
      const found = reply?.inspection;
      if (found && !found.unavailable) {
        setAiDown(false);
        if (found.kind === "strike")
          return showCoach({
            mood: "angry",
            tag: "违规 +1",
            detail: found.verdict?.reason,
          });
        if (found.kind === "warning")
          return showCoach({
            mood: "angry",
            tag: "提醒",
            detail: found.verdict?.reason,
          });
        return showCoach({ mood: "pleased", detail: found.verdict?.reason });
      }
      setAiDown(true);
      if (!down) toast("AI 查岗这次没成功，先用本机检测，下次查岗会再试");
    } else await wait(1800);
    const sample = latest.current.live;
    showCoach(
      sample?.present && !sample.phone
        ? { mood: "pleased" }
        : { mood: "calm", detail: "我过会儿再来看看。" },
    );
  }

  // Local detection, every 2 s.
  useEffect(() => {
    if (phase !== "running") return;
    return ticker(SAMPLE_MS, () => {
      const v = video.current,
        d = detector.current,
        t = tracker.current;
      if (!v || !d || !t) return;
      const sample: Sample = latest.current.cameraLost
        ? {
            t: Date.now(),
            present: false,
            phone: false,
            pose: null,
            blink: null,
          }
        : d.sample(v);
      setLive(sample);
      for (const source of t.update(sample)) void report(source);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report reads refs; restarting would reset timing
  }, [phase]);
  // Heartbeat, so the server can tell a closed page from a running one. While she studies it also
  // brings back the referee's live visits, so it runs often enough for the door to open promptly.
  useEffect(() => {
    if ((phase !== "running" && phase !== "paused") || !sessionId) return;
    return ticker(phase === "running" ? 8_000 : 30_000, async () => {
      const reply = await latest.current.post(
        { type: "heartbeat", sessionId },
        true,
      );
      if (reply?.visit && phase === "running") arrive(reply.visit);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arrive reads refs; restarting would skip beats
  }, [phase, sessionId]);
  // Coach inspections at random, unannounced moments.
  useEffect(() => {
    if (phase !== "running" || !session) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await inspect();
        schedule();
      }, inspectionDelay(session.rules));
    };
    schedule();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one schedule per running stretch
  }, [phase, sessionId]);
  // The clock: end of timer, and a pause that ran out.
  useEffect(() => {
    if (phase !== "running" && phase !== "paused") return;
    const id = setInterval(async () => {
      setTick((n) => n + 1);
      const s = latest.current.session;
      if (!s) return;
      if (phase === "running" && Date.parse(s.endsAt) <= now()) {
        clearInterval(id);
        stopAll();
        await latest.current.post({ type: "heartbeat", sessionId: s.id }, true);
        setPhase("summary");
      }
      if (
        phase === "paused" &&
        s.pausedAt &&
        now() > Date.parse(s.pausedAt) + s.rules.pauseMinutes * 60_000 + 31_000
      ) {
        clearInterval(id);
        await reload();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, now, reload, stopAll]);
  // The server ended it (left too long, pause ran over): show the result.
  useEffect(() => {
    if (
      session?.endedAt &&
      ["running", "paused", "reconnect", "summary"].includes(phase)
    )
      queueMicrotask(() => finish(session.id));
  }, [session?.endedAt, session?.id, phase, finish]);

  const setting = (key: string, value: boolean, set: (v: boolean) => void) => {
    set(value);
    save(key, value ? "1" : "0");
  };
  const toggleShare = async (value: boolean) => {
    setting(KEYS.share, value, setShare);
    if (session && !session.endedAt)
      await post({ type: "share", sessionId: session.id, share: value }, true);
  };
  const posterSession = view.sessions.find((s) => s.id === posterId);

  return (
    <>
      {cameraOn && (
        <div className="camera-pill" role="status">
          <span className="rec-dot" aria-hidden="true" />
          摄像头开启中{screenOn && " · 屏幕共享中"}
          <button
            onClick={() =>
              phase === "running"
                ? void endEarly()
                : (stopAll(), setPhase("intro"))
            }
          >
            关闭摄像头{phase === "running" && "（结束本次）"}
          </button>
        </div>
      )}
      <video ref={screenVideo} className="screen-source" muted playsInline />

      {phase === "intro" && (
        <>
          <Intro
            view={view}
            setup={{
              goals,
              goal,
              minutes,
              rewardRemaining,
              rewardLimit,
              toggleGoal,
              setGoal,
              setMinutes,
            }}
            onStart={begin}
          >
            <Switch
              checked={aiOn}
              disabled={!view.ai}
              onChange={(v) => {
                setting(KEYS.ai, v, setWantAi);
                if (v && consent !== "yes") {
                  startAfterConsent.current = false;
                  setConsentOpen(true);
                }
              }}
              label="教练用 AI 查岗"
              note={
                !view.ai
                  ? "服务器还没有配置 AI（GEMINI_API_KEY），这次只用本机检测。"
                  : consent === "no" && wantAi
                    ? "你之前没有同意发送画面，打开开关可以重新查看说明。"
                    : `查岗时把 1 张缩小的画面发给 ${view.ai.label} 判断你在做什么。`
              }
            />
            <Switch
              checked={aiOn && wantScreen}
              disabled={!aiOn}
              onChange={(v) => setting(KEYS.screen, v, setWantScreen)}
              label="同时看屏幕"
              note="开始前选择共享整个屏幕，只在查岗那一刻截一帧给 AI。需要先打开 AI 查岗。"
            />
            <Switch
              checked={share}
              onChange={(v) => void toggleShare(v)}
              label="违规截图给裁判看"
              note="被记提醒或违规时，上传一张缩小的摄像头截图，只有你和裁判能看。可以随时全部删除。"
            />
            <Switch
              checked={knockOn}
              onChange={(v) => setting(KEYS.knock, v, setKnockOn)}
              label="敲门声"
              note="教练来后门时敲两下，戴着耳机也能听见。"
            />
          </Intro>
          <WeeklyPlanCard />
          <SessionList view={view} onPoster={setPosterId} />
          <DeleteSnapshots view={view} post={post} />
          {posterId && posterSession && (
            <Modal
              title="学习结算单"
              close={() => setPosterId(null)}
              className="poster-modal"
            >
              <Poster
                view={view}
                session={posterSession}
                name={snapshot.name}
              />
            </Modal>
          )}
        </>
      )}

      {phase === "explain" && (
        <section className="white-panel study-step">
          <h2>开始前，先说清楚摄像头会做什么</h2>
          <ul className="study-list">
            <li>
              每 2
              秒在这台设备上分析一次画面：你是否在镜头前、有没有拿手机、头朝向哪里、是否长时间闭眼。
            </li>
            <li>视频不会离开这台设备，也不会被录下来。</li>
            {aiOn && (
              <li>
                教练查岗时，把 1 张缩小的摄像头画面
                {wantScreen && "和 1 张屏幕画面"}发给 {view.ai?.label}{" "}
                判断你在做什么。
              </li>
            )}
            <li>
              {share
                ? "被记提醒或违规时，保存一张缩小的截图给裁判看。"
                : "不保存任何截图。"}
            </li>
            <li>首次使用要下载约 20 MB 的检测模型，之后浏览器会缓存。</li>
          </ul>
          {problem && (
            <p className="form-error" role="alert">
              {problem}
            </p>
          )}
          <div className="study-step-actions">
            <button
              className="button primary"
              onClick={() => void openCamera()}
            >
              <Camera size={17} /> 开启摄像头
            </button>
            <button className="text-button" onClick={() => setPhase("intro")}>
              返回
            </button>
          </div>
        </section>
      )}

      {(phase === "loading" ||
        phase === "calibrating" ||
        phase === "ready") && (
        <section className="white-panel study-step setup">
          <div className="setup-camera">
            <video
              ref={attach}
              className="camera-preview"
              muted
              playsInline
              autoPlay
            />
            {phase === "calibrating" && !problem && (
              <div
                className="calibration-ring"
                style={{ "--p": progress } as CSSProperties}
              >
                <span>{Math.round(progress * 5)} / 5 秒</span>
              </div>
            )}
          </div>
          <div className="setup-copy">
            {phase === "loading" && (
              <>
                <h2>正在加载本机检测模型</h2>
                <p className="muted">
                  <LoaderCircle className="spin" size={16} /> 首次约 20
                  MB，请稍等。
                </p>
              </>
            )}
            {phase === "calibrating" && (
              <>
                <h2>校准：看向你的学习材料</h2>
                <p className="muted">
                  像平时学习那样坐好，看着书、笔记或屏幕 5
                  秒。之后视线离开这个范围太久会被提醒。
                </p>
                {problem && (
                  <>
                    <p className="form-error" role="alert">
                      {problem}
                    </p>
                    <div className="study-step-actions">
                      <button
                        className="button primary"
                        onClick={() => void runCalibration()}
                      >
                        重新校准
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setBaseline(null);
                          setProblem("");
                          setPhase("ready");
                        }}
                      >
                        跳过校准（这次不检查视线）
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {phase === "ready" && (
              <>
                <h2>
                  <Check size={20} /> 校准完成
                </h2>
                <p className="ready-intention">
                  <b>{combinedGoal || "自由学习"}</b>
                  <br />
                  {minutes} 分钟 ·{" "}
                  {rewardRemaining
                    ? `通过 +${studyPoints(view.rules, minutes)} 积分`
                    : "今日奖励名额已用完，本场不加分"}
                </p>
                <p className="muted">
                  {view.rules.maxStrikes}{" "}
                  次违规算失败。教练会在你看不到的时候来查岗。
                </p>
                {aiOn && wantScreen && !screenOn && (
                  <button
                    className="button secondary"
                    onClick={() => void shareScreen()}
                  >
                    <Monitor size={17} /> 选择要共享的屏幕
                  </button>
                )}
                <button className="button primary" onClick={() => void start()}>
                  <Play size={17} /> 开始 {minutes} 分钟
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {phase === "reconnect" && session && (
        <section className="white-panel study-step">
          <h2>这场学习还在进行</h2>
          <p className="muted">
            还剩 {clock(Date.parse(session.endsAt) - now())}
            。重新开启摄像头继续；离开超过 3 分钟会被判定为中途离开。
          </p>
          <button className="button primary" onClick={() => void reconnect()}>
            <Camera size={17} /> 重新开启摄像头
          </button>
        </section>
      )}

      {(phase === "running" || phase === "paused") && session && (
        <Hud
          view={view}
          session={session}
          coach={coach}
          bigCam={bigCam}
          onToggleCam={() => {
            setBigCam(!bigCam);
            save(KEYS.selfView, bigCam ? "small" : "big");
          }}
          remaining={Date.parse(session.endsAt) - now()}
          pauseLeft={
            session.pausedAt
              ? Date.parse(session.pausedAt) +
                session.rules.pauseMinutes * 60_000 -
                now()
              : 0
          }
          paused={phase === "paused"}
          live={live}
          cameraLost={cameraLost}
          aiDown={aiDown}
          attach={attach}
          onPause={() => void pause()}
          onResume={() => void resume()}
          onEnd={() => void endEarly()}
          onRetryCamera={() =>
            void startCamera().catch((e) => toast.error(cameraProblem(e)))
          }
          struckOut={session.result.struckOut && !struckSeen}
          onKeepGoing={() => setStruckSeen(true)}
        />
      )}

      {phase === "summary" && session && (
        <SummaryForm session={session} onSubmit={submitSummary} />
      )}

      {phase === "done" && posterSession && (
        <section className="study-done">
          <Poster view={view} session={posterSession} name={snapshot.name} />
          <button className="text-button" onClick={() => setPhase("intro")}>
            回到学习模式
          </button>
        </section>
      )}

      {consentOpen && (
        <Consent
          view={view}
          close={(answer) => {
            setConsentOpen(false);
            if (!answer) return;
            setConsent(answer);
            save(KEYS.consent, answer);
            setting(KEYS.ai, answer === "yes", setWantAi);
            if (startAfterConsent.current) setPhase("explain");
          }}
        />
      )}
    </>
  );
}

const gap = (r: StudyRules) =>
  r.minGap === r.maxGap
    ? `每 ${r.minGap} 分钟`
    : `${r.minGap}–${r.maxGap} 分钟之间随机`;
function gentleSignals(r: StudyRules) {
  return [
    `离开镜头超过 ${duration(r.absentSeconds)}`,
    "一直在看手机",
    r.drowsySeconds > 0 && `闭眼超过 ${duration(r.drowsySeconds)}`,
    r.lookAwaySeconds > 0 && `视线离开超过 ${duration(r.lookAwaySeconds)}`,
    "AI 查岗很确定你在娱乐或不在座位",
  ]
    .filter(Boolean)
    .join("、");
}
function strictReminders(r: StudyRules) {
  return [
    r.lookAwaySeconds > 0 &&
      `视线离开学习区域超过 ${duration(r.lookAwaySeconds)}`,
    r.drowsySeconds > 0 && `闭眼超过 ${duration(r.drowsySeconds)}`,
    "AI 认定你在聊天，或把握不大时",
  ]
    .filter(Boolean)
    .join("；")
    .concat(`。${r.warningsPerStrike} 次提醒算 1 次违规。`);
}
type Setup = {
  goals: string[];
  goal: string;
  minutes: number;
  rewardRemaining: number;
  rewardLimit: number;
  toggleGoal: (label: string) => void;
  setGoal: (text: string) => void;
  setMinutes: (minutes: number) => void;
};
function Intro({
  view,
  setup,
  onStart,
  children,
}: {
  view: StudyView;
  setup: Setup;
  onStart: () => void;
  children: ReactNode;
}) {
  const r = view.rules,
    { goals, goal, minutes, rewardRemaining, rewardLimit } = setup;
  // The server caps the goal at 80 characters, chips and the extra line together.
  const room = Math.max(
    0,
    80 - goals.join("；").length - (goals.length ? 1 : 0),
  );
  return (
    <>
      <section className="study-hero">
        {/* Tonight's plan is written on the board itself: what, one more line, and how long. */}
        <div className="study-board setup">
          <div className="board-top">
            <span>晚自习 · 距下课还有</span>
            <StrikeMarks used={0} max={r.maxStrikes} />
          </div>
          <div className="board-clock">
            {String(minutes).padStart(2, "0")}:00
          </div>
          <div
            className="chalk-row"
            role="group"
            aria-label="这场做什么，可以多选"
          >
            <span className="chalk-label">今晚做</span>
            {STUDY_GOALS.map((label) => (
              <button
                key={label}
                type="button"
                className={`chalk-chip ${goals.includes(label) ? "on" : ""}`}
                aria-pressed={goals.includes(label)}
                onClick={() => setup.toggleGoal(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="chalk-line"
            value={goal}
            onChange={(e) => setup.setGoal(e.target.value)}
            maxLength={room}
            placeholder="再补一句，比如：投两份岗位，再复盘项目（可选）"
            aria-label="补一句目标"
          />
          <div className="chalk-row durations" role="radiogroup" aria-label="学多久">
            <span className="chalk-label">学多久</span>
            {minuteChoices().map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === minutes}
                className={`chalk-num ${m === minutes ? "on" : ""}`}
                onClick={() => setup.setMinutes(m)}
              >
                {m}
              </button>
            ))}
            <span className="chalk-unit">分钟</span>
            <span className="chalk-reward">
              {rewardRemaining
                ? `通过 +${studyPoints(r, minutes)} 积分`
                : "今天的奖励名额用完了，这场不加分"}
            </span>
          </div>
          <div className="board-foot">
            <span>
              今天还有 {rewardRemaining} / {rewardLimit} 次奖励名额
            </span>
            <span>教练会{gap(r)}来后门看看你</span>
          </div>
        </div>
        <div className="hero-door">
          <Door view={view} still="calm" />
          <p>“{view.coach.lines.calm}”</p>
        </div>
      </section>
      <div className="study-columns">
        <section className="white-panel study-rules">
          <h2>规则</h2>
          <dl>
            <dt>通过</dt>
            <dd>
              当天最低目标完成时，按所选时长奖励 {studyPoints(r, minutes)}{" "}
              积分。三种时长每天合计最多奖励{" "}
              {r.dailyRewardLimit ?? STUDY_REWARD_LIMIT}{" "}
              次。不影响当天是否达标。
            </dd>
            <dt>失败</dt>
            <dd>
              ${r.penalty} 进请客基金：
              {r.strict
                ? `${r.maxStrikes} 次违规（${r.warningsPerStrike} 次提醒算 1 次）`
                : `累计 ${r.maxStrikes * r.warningsPerStrike} 次提醒`}
              、提前结束、中途离开页面超过 3 分钟、暂停超过 {r.pauseMinutes}{" "}
              分钟。
            </dd>
            <dt>{r.strict ? "违规" : "提醒"}</dt>
            <dd>
              {r.strict
                ? `离开镜头超过 ${duration(r.absentSeconds)}；镜头里一直有手机；AI 查岗很有把握地认定你在娱乐或不在座位。`
                : `只在特别明显时提醒：${gentleSignals(r)}。平时看书、想问题、低头写字都不会被打扰。`}
            </dd>
            {r.strict && (
              <>
                <dt>提醒</dt>
                <dd>{strictReminders(r)}</dd>
              </>
            )}
            <dt>下课后</dt>
            <dd>
              {r.strict
                ? "写三行总结。AI 评分低于 3 分，记 1 次提醒。"
                : "写三行总结，帮自己回顾。只有空洞、和学习无关的总结才会记提醒。"}
            </dd>
          </dl>
        </section>
        <section className="white-panel study-options">
          <h2>这次怎么检查</h2>
          {children}
          {goals.includes("Networking") && <NetworkingLink />}
          <button className="button primary full" onClick={onStart}>
            准备开始 {minutes} 分钟
          </button>
        </section>
      </div>
    </>
  );
}

function Switch({
  checked,
  onChange,
  label,
  note,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  note: string;
  disabled?: boolean;
}) {
  return (
    <label className={`study-switch ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
    </label>
  );
}

function Consent({
  view,
  close,
}: {
  view: StudyView;
  close: (answer: "yes" | "no" | null) => void;
}) {
  const gemini = view.ai?.id === "gemini";
  return (
    <Modal
      title="AI 查岗需要你的同意"
      close={() => close(null)}
      className="consent-modal"
    >
      <ul className="study-list">
        <li>
          教练查岗时，会把 1 张缩小的摄像头画面（开启「同时看屏幕」时再加 1
          张屏幕画面）发送给 <strong>{view.ai?.label}</strong>
          ，判断你是否在学习。
        </li>
        <li>其余时间的检测都在这台设备上完成，视频不会上传。</li>
        <li>
          我们的服务器不保存这些画面。只有你打开「违规截图给裁判看」并且被记提醒或违规时，才保存那一张摄像头截图。
        </li>
        {gemini ? (
          <li>
            Google 按照{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
            >
              Gemini API 条款
            </a>
            处理这些画面。
          </li>
        ) : (
          <li className="consent-warning">
            画面会由这个服务商处理，请先了解它的数据政策。
          </li>
        )}
        <li>不同意也可以学习：只用本机检测，不发送任何画面。</li>
      </ul>
      <div className="study-step-actions">
        <button className="button primary" onClick={() => close("yes")}>
          同意，开启 AI 查岗
        </button>
        <button className="text-button" onClick={() => close("no")}>
          不同意，只用本机检测
        </button>
      </div>
    </Modal>
  );
}

function Hud({
  view,
  session,
  coach,
  bigCam,
  onToggleCam,
  remaining,
  pauseLeft,
  paused,
  live,
  cameraLost,
  aiDown,
  attach,
  onPause,
  onResume,
  onEnd,
  onRetryCamera,
  struckOut,
  onKeepGoing,
}: {
  view: StudyView;
  session: ViewSession;
  coach: CoachEvent | null;
  bigCam: boolean;
  onToggleCam: () => void;
  remaining: number;
  pauseLeft: number;
  paused: boolean;
  live: Sample | null;
  cameraLost: boolean;
  aiDown: boolean;
  attach: (el: HTMLVideoElement | null) => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onRetryCamera: () => void;
  struckOut: boolean;
  onKeepGoing: () => void;
}) {
  const r = session.result,
    rules = withDefaults(session.rules);
  const events = [...session.strikes].reverse();
  const signals = [
    {
      icon: UserRound,
      label: live?.present === false ? "不在镜头前" : "在镜头前",
      ok: live ? live.present : null,
    },
    {
      icon: Smartphone,
      label: live?.phone ? "看到手机" : "没有手机",
      ok: live ? !live.phone : null,
    },
    {
      icon: Eye,
      label:
        live?.blink !== null && (live?.blink ?? 0) > rules.blinkThreshold
          ? "眼睛闭着"
          : "眼睛睁着",
      ok: live?.blink == null ? null : live.blink <= rules.blinkThreshold,
    },
  ];
  return (
    <>
      {struckOut && (
        <div className="struck-banner" role="alert">
          <strong>
            已经 {rules.maxStrikes} 次违规，这次判定为失败，${rules.penalty}{" "}
            进请客基金。
          </strong>
          <span>
            你可以现在结束；也可以学完：如果裁判推翻误判，这次仍然可能通过。
          </span>
          <div>
            <button className="button primary" onClick={onKeepGoing}>
              继续学完
            </button>
            <button className="text-button" onClick={onEnd}>
              现在结束
            </button>
          </div>
        </div>
      )}
      <section className="study-hero live">
        <section className={`study-board running ${paused ? "is-paused" : ""}`}>
          <div className="board-top">
            <span>{paused ? "暂停中 · 必须在这之前回来" : "距下课还有"}</span>
            <StrikeMarks
              used={Math.min(r.effective, rules.maxStrikes)}
              max={rules.maxStrikes}
            />
          </div>
          <div className="board-clock" aria-live="off">
            {clock(paused ? pauseLeft : remaining)}
          </div>
          {session.goal && <p className="board-goal">今晚学：{session.goal}</p>}
          <div className="board-foot">
            <span>
              提醒 {r.warnings} 次 · 违规{" "}
              {Math.min(r.effective, rules.maxStrikes)} / {rules.maxStrikes}
              {r.effective > rules.maxStrikes && `（共 ${r.effective} 次）`}
            </span>
            <span>{paused ? "摄像头已关闭" : "教练随时会来查岗"}</span>
          </div>
        </section>
        <div className="hero-door">
          <Door view={view} event={paused ? null : coach} />
        </div>
      </section>
      {aiDown && (
        <p className="study-notice">
          上一次 AI 查岗没成功，先用本机检测；下次查岗会再试。
        </p>
      )}
      <div className="study-hud">
        <div className={`white-panel hud-camera ${bigCam ? "" : "compact"}`}>
          {paused ? (
            <div className="camera-off">
              <Pause size={28} />
              <p>暂停中，摄像头已关闭。</p>
            </div>
          ) : (
            <video
              ref={attach}
              className="camera-preview small"
              muted
              playsInline
              autoPlay
            />
          )}
          <div className="hud-signals">
            {cameraLost && !paused && (
              <div className="camera-lost" role="alert">
                摄像头断开了，这段时间会算作离开镜头。
                <button className="small-button" onClick={onRetryCamera}>
                  重新开启
                </button>
              </div>
            )}
            {!paused && (
              <ul className="signal-list">
                {signals.map(({ icon: Icon, label, ok }) => (
                  <li
                    key={label}
                    className={ok === null ? "unknown" : ok ? "ok" : "bad"}
                  >
                    <Icon size={15} /> {ok === null ? "检测中…" : label}
                  </li>
                ))}
              </ul>
            )}
            {!paused && (
              <button className="text-button" onClick={onToggleCam}>
                {bigCam ? (
                  <>
                    <Minimize2 size={15} /> 缩小镜头
                  </>
                ) : (
                  <>
                    <Maximize2 size={15} /> 看看镜头
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="white-panel hud-events">
          <h2>这次的记录</h2>
          {events.length === 0 ? (
            <p className="muted">还没有提醒，保持住。</p>
          ) : (
            <ul>
              {events.map((s) => (
                <li
                  key={s.id}
                  className={s.overturnedAt ? "overturned" : s.kind}
                >
                  <time>{nyTime(s.at)}</time>
                  <b>{KIND_LABEL[s.kind]}</b>
                  <span>
                    {SOURCE_LABEL[s.source]} · {s.reason}
                    {s.overturnedAt && "（裁判已推翻）"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <NetworkingLink />
      <p className="muted small">
        去其他网站学习时，请保留这个学习标签页和摄像头。不要关闭本页；设备休眠或连接中断可能影响本场记录。
      </p>
      <div className="hud-actions">
        {paused ? (
          <button className="button primary" onClick={onResume}>
            <Play size={17} /> 继续学习
          </button>
        ) : (
          <button
            className="button secondary"
            onClick={onPause}
            disabled={session.pauseUsed || rules.pauseMinutes <= 0}
          >
            <Pause size={17} />{" "}
            {session.pauseUsed
              ? "本次已暂停过"
              : `暂停 ${rules.pauseMinutes} 分钟（仅一次）`}
          </button>
        )}
        <button className="text-button danger" onClick={onEnd}>
          提前结束（算作失败）
        </button>
      </div>
    </>
  );
}

function SummaryForm({
  session,
  onSubmit,
}: {
  session: ViewSession;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="white-panel study-step summary-step">
      <h2>下课了。用三行写下你学到了什么</h2>
      <p className="muted">
        {withDefaults(session.rules).strict
          ? "做了什么、一个具体的收获或进展、下一步。AI 会按这三点打分，低于 3 分记 1 次提醒。"
          : "做了什么、一个具体的收获或进展、下一步。写给自己看，只有空洞、和学习无关的总结才会记提醒。"}
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit(text);
          setBusy(false);
        }}
      >
        <label>
          三行总结
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            minLength={10}
            maxLength={2000}
            required
            placeholder={
              "复习了分类模型的评估指标\n弄清了 PR-AUC 和 ROC-AUC 在不平衡数据上的区别\n明天用 SQL 题练一遍窗口函数"
            }
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "正在评分…" : "提交总结，查看结算"}
        </button>
      </form>
      <p className="muted small">
        本次违规 {session.result.effective} / {session.rules.maxStrikes}。
      </p>
    </section>
  );
}

function SessionList({
  view,
  onPoster,
  referee,
}: {
  view: StudyView;
  onPoster?: (id: string) => void;
  referee?: { post: Post };
}) {
  const [overturning, setOverturning] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const sessions = view.sessions.slice(0, referee ? 60 : 10);
  const eligible = studyRewards(
    view.sessions.map((s) => studyOutcome(s, view.serverTime)),
  );
  if (!sessions.length)
    return (
      <section className="white-panel session-list empty">
        <h2>学习记录</h2>
        <p className="muted">
          {referee
            ? "她还没有开始过学习模式。"
            : "还没有学习记录。开一场 30 分钟的晚自习吧。"}
        </p>
      </section>
    );
  return (
    <section className="white-panel session-list">
      <h2>学习记录</h2>
      <ul>
        {sessions.map((s) => {
          const r = s.result,
            counted = s.strikes.filter((x) => !x.overturnedAt);
          return (
            <li key={s.id}>
              <details open={referee ? r.status === "failed" : undefined}>
                <summary>
                  <Stamp status={r.status} />
                  <span className="session-when">
                    <strong>{s.day}</strong> {nyTime(s.startedAt)}
                  </span>
                  <span className="session-meta">
                    {r.studiedMinutes} 分钟 · 违规{" "}
                    {Math.min(r.effective, s.rules.maxStrikes)}/
                    {s.rules.maxStrikes}
                    {counted.length > 0 &&
                      ` · ${[...new Set(counted.map((x) => SOURCE_LABEL[x.source]))].join("、")}`}
                    {s.visits.length > 0 && ` · 裁判来过 ${s.visits.length} 次`}
                  </span>
                  <span className="session-layers">
                    {s.layers.ai && <span title="AI 查岗">AI</span>}
                    {s.layers.screen && <span title="同时看屏幕">屏幕</span>}
                    {s.share && <span title="违规截图给裁判看">截图</span>}
                  </span>
                </summary>
                <div className="session-body">
                  {r.status === "passed" && (
                    <p className="session-reward">
                      {eligible.some((o) => o.id === s.id)
                        ? `本场奖励 ${s.rules.points} 积分 · 当天达标后计入总分`
                        : "本场已完成，超出每日奖励次数，不再加分"}
                    </p>
                  )}
                  {s.goal && (
                    <p className="session-goal">
                      <b>这场学的</b>
                      {s.goal}
                    </p>
                  )}
                  {s.strikes.length === 0 ? (
                    <p className="muted">没有提醒或违规。</p>
                  ) : (
                    <ul className="strike-list">
                      {s.strikes.map((x) => (
                        <li
                          key={x.id}
                          className={x.overturnedAt ? "overturned" : x.kind}
                        >
                          <time>{nyTime(x.at)}</time>
                          <b>{KIND_LABEL[x.kind]}</b>
                          <span>
                            {SOURCE_LABEL[x.source]} · {x.reason}
                            {x.confidence !== null &&
                              ` · 把握 ${Math.round(x.confidence * 100)}%`}
                            {x.overturnedAt && (
                              <em>已推翻：{x.overturnReason}</em>
                            )}
                          </span>
                          {x.hasSnapshot && (
                            <a
                              href={`/api/study/media?snapshot=${x.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- private, same-origin media route */}
                              <img
                                src={`/api/study/media?snapshot=${x.id}`}
                                alt={`违规截图：${x.reason}`}
                              />
                            </a>
                          )}
                          {referee &&
                            !x.overturnedAt &&
                            overturning !== x.id && (
                              <button
                                className="small-button"
                                onClick={() => (
                                  setOverturning(x.id),
                                  setReason("")
                                )}
                              >
                                推翻
                              </button>
                            )}
                          {referee && overturning === x.id && (
                            <form
                              className="overturn-form"
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (
                                  await referee.post({
                                    type: "overturn",
                                    strikeId: x.id,
                                    reason,
                                  })
                                ) {
                                  setOverturning(null);
                                  toast.success(
                                    "已推翻，这次学习的结果和罚金已重新计算",
                                  );
                                }
                              }}
                            >
                              <input
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                minLength={3}
                                maxLength={1000}
                                required
                                autoFocus
                                aria-label="推翻理由"
                                placeholder="理由，例如：她在看纸质书，不是在玩手机"
                              />
                              <button className="small-button">确认推翻</button>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setOverturning(null)}
                              >
                                取消
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.summary && (
                    <p className="session-summary">
                      <b>
                        总结
                        {s.summaryGrade?.score != null &&
                          ` · ${s.summaryGrade.score}/5`}
                      </b>
                      {s.summary}
                    </p>
                  )}
                  {onPoster && s.endedAt && (
                    <button
                      className="text-button"
                      onClick={() => onPoster(s.id)}
                    >
                      查看结算单
                    </button>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DeleteSnapshots({ view, post }: { view: StudyView; post: Post }) {
  const [open, setOpen] = useState(false);
  const count = view.sessions.reduce(
    (n, s) => n + s.strikes.filter((x) => x.hasSnapshot).length,
    0,
  );
  if (!count) return null;
  return (
    <>
      <button
        className="text-button danger delete-snapshots"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={16} /> 删除所有违规截图（{count} 张）
      </button>
      {open && (
        <Modal title="删除所有违规截图？" close={() => setOpen(false)}>
          <p>
            会永久删除已上传的 {count}{" "}
            张截图，裁判也看不到了。违规记录本身会保留。
          </p>
          <div className="study-step-actions">
            <button
              className="button primary"
              onClick={async () => {
                const reply = await post({ type: "deleteSnapshots" });
                if (reply) {
                  toast.success(`已删除 ${reply.deleted ?? count} 张截图`);
                  setOpen(false);
                }
              }}
            >
              删除全部截图
            </button>
            <button className="text-button" onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RefereeStudy({
  view,
  post,
  now,
  reload,
}: {
  view: StudyView;
  post: Post;
  now: () => number;
  reload: () => Promise<void>;
}) {
  const done = view.sessions.filter((s) => s.endedAt),
    passed = done.filter((s) => s.result.status === "passed").length;
  const live = view.sessions.find((s) => !s.endedAt) ?? null,
    liveId = live?.id ?? null;
  const [, setTick] = useState(0);
  // While she studies, the page keeps up with her clock and with whether she saw the door open.
  useEffect(() => {
    const poll = setInterval(
      () => {
        if (!document.hidden) void reload();
      },
      liveId ? 8_000 : 30_000,
    );
    const tick = liveId
      ? setInterval(() => setTick((n) => n + 1), 1000)
      : undefined;
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [liveId, reload]);
  const paused = live?.result.status === "paused";
  return (
    <>
      <section className="study-hero referee">
        {live ? (
          <div className={`study-board running ${paused ? "is-paused" : ""}`}>
            <div className="board-top">
              <span>
                {paused ? "她暂停了，摄像头关着" : "她正在晚自习 · 距下课还有"}
              </span>
              <StrikeMarks
                used={Math.min(live.result.effective, live.rules.maxStrikes)}
                max={live.rules.maxStrikes}
              />
            </div>
            <div className="board-clock">
              {clock(Date.parse(live.endsAt) - now())}
            </div>
            {live.goal && <p className="board-goal">今晚学：{live.goal}</p>}
            <div className="board-foot">
              <span>
                提醒 {live.result.warnings} 次 · 违规{" "}
                {Math.min(live.result.effective, live.rules.maxStrikes)} /{" "}
                {live.rules.maxStrikes}
              </span>
              <span>{nyTime(live.startedAt)} 开始</span>
            </div>
          </div>
        ) : (
          <div className="study-board">
            <div className="board-top">
              <span>她的晚自习</span>
            </div>
            <div className="board-clock">
              {passed}
              <small> / {done.length}</small>
            </div>
            <p className="board-note">
              次通过。误判的违规可以推翻，结果和请客基金会重新计算。
            </p>
          </div>
        )}
        <div className="hero-door">
          <Door view={view} still="calm" />
          <p>
            {live
              ? "她的屏幕上也有这扇门。"
              : "她开始晚自习时，你可以从这里去后门看看她。"}{" "}
            教练照片和台词在 <Link href="/settings">挑战设置</Link> 里修改。
          </p>
        </div>
      </section>
      {live && <LiveVisit view={view} session={live} post={post} now={now} />}
      <SessionList view={view} referee={{ post }} />
      <p className="muted small study-footnote">
        <ShieldCheck size={14} />{" "}
        截图只有在她打开「违规截图给裁判看」时才会上传，她可以随时全部删除。
      </p>
    </>
  );
}

/** The referee opens the door on her screen: a face, a line, and whether she saw it. */
function LiveVisit({
  view,
  session,
  post,
  now,
}: {
  view: StudyView;
  session: ViewSession;
  post: Post;
  now: () => number;
}) {
  const [mood, setMood] = useState<CoachMood>("calm"),
    [line, setLine] = useState(view.coach.lines.calm),
    [busy, setBusy] = useState(false);
  const paused = session.result.status === "paused";
  const last = session.visits.at(-1);
  const wait = last
    ? Math.max(0, VISIT_GAP_MS - (now() - Date.parse(last.at)))
    : 0;
  if (!view.features.visits)
    return (
      <section className="white-panel live-visit">
        <div className="live-visit-head">
          <h2>去后门看看她</h2>
          <p>
            真人查岗需要先在 Supabase SQL Editor 执行
            supabase/migrations/003_visits.sql，然后刷新这个页面。
          </p>
        </div>
      </section>
    );
  return (
    <section className="white-panel live-visit">
      <div className="live-visit-head">
        <h2>去后门看看她</h2>
        <p>选一张脸、说一句话，她屏幕上的这扇门就会打开。</p>
      </div>
      <div className="mood-picker" role="radiogroup" aria-label="用哪张脸">
        {COACH_MOODS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === mood}
            onClick={() => {
              setMood(m);
              setLine(view.coach.lines[m]);
            }}
          >
            <DoorWindow src={coachSrc(view, m)} mood={m} size="sm" />
            {COACH_MOOD_LABEL[m]}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const reply = await post({
            type: "visit",
            sessionId: session.id,
            mood,
            line,
          });
          setBusy(false);
          if (reply) toast.success("门开了，她几秒内就会看到");
        }}
      >
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          maxLength={120}
          required
          aria-label="对她说的话"
        />
        <button
          className="button primary"
          disabled={busy || paused || wait > 0}
        >
          <DoorOpen size={17} />{" "}
          {paused
            ? "她暂停了，等她回来"
            : wait > 0
              ? `刚去过 · ${Math.ceil(wait / 1000)} 秒后再去`
              : "开门"}
        </button>
      </form>
      {session.visits.length > 0 && (
        <ul className="visit-log">
          {[...session.visits].reverse().map((v) => (
            <li key={v.id}>
              <time>{nyTime(v.at)}</time>
              {COACH_MOOD_LABEL[v.mood]} · “{v.line}”
              {v.seenAt ? (
                <em>她看到了</em>
              ) : (
                <em className="pending">还没看到</em>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
