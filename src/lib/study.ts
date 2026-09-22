// Study Mode rules and bookkeeping shared by the browser, the API and the settlement replay.
// Everything here is pure: detection runs in the browser, results are derived from stored events.

export type StudyRules = {
  minutes: number;
  maxStrikes: number;
  /** This many warnings count as one strike. */
  warningsPerStrike: number;
  /** Random gap between coach inspections, in minutes. */
  minGap: number;
  maxGap: number;
  /** Legacy reward; preserved on existing session snapshots. */
  points: number;
  /** New sessions snapshot the rewards for the three duration tiers. */
  rewardTiers?: Record<StudyMinutes, number>;
  dailyRewardLimit?: number;
  /** Dollars added to the penalty pool for a failed session. */
  penalty: number;
  pauseMinutes: number;
  absentSeconds: number;
  /** A phone seen in this many of the last PHONE_WINDOW samples counts once. */
  phoneHits: number;
  lookAwaySeconds: number;
  yawTolerance: number;
  pitchTolerance: number;
  drowsySeconds: number;
  blinkThreshold: number;
  /** Gentle mode: the AI confidence a verdict needs before it costs a reminder. */
  aiConfidence: number;
  /** Strict mode turns leaving, phones and confident AI verdicts into strikes. */
  strict: boolean;
};
/**
 * Gentle by default, so a focused session never feels like a trap: only unmistakable lapses
 * (away for minutes, a phone in hand, eyes shut for a minute, a confident AI verdict) cost a
 * reminder, and it takes several reminders to fail. Looking away is off, since reading from
 * paper or thinking looks the same to a camera.
 */
export const STUDY_MINUTES = [20, 30, 45] as const;
export type StudyMinutes = (typeof STUDY_MINUTES)[number];
export const STUDY_REWARD_LIMIT = 5;
export const DEFAULT_STUDY_REWARDS = { 20: 15, 30: 25, 45: 40 };
export const STUDY_GOALS = [
  "投递申请",
  "Networking",
  "技术学习",
  "面试 / BQ",
  "项目练习",
  "英语学习",
  "自由学习",
] as const;

export const DEFAULT_STUDY: StudyRules = {
  minutes: 30,
  maxStrikes: 3,
  warningsPerStrike: 2,
  minGap: 3,
  maxGap: 8,
  points: 25,
  rewardTiers: DEFAULT_STUDY_REWARDS,
  dailyRewardLimit: STUDY_REWARD_LIMIT,
  penalty: 5,
  pauseMinutes: 5,
  absentSeconds: 180,
  phoneHits: 4,
  lookAwaySeconds: 0,
  yawTolerance: 30,
  pitchTolerance: 25,
  drowsySeconds: 60,
  blinkThreshold: 0.6,
  aiConfidence: 0.85,
  strict: false,
};
/** Rules saved before a field existed get that field's default. */
export const withDefaults = (rules?: Partial<StudyRules>): StudyRules => ({
  ...DEFAULT_STUDY,
  ...rules,
  rewardTiers: { ...DEFAULT_STUDY_REWARDS, ...rules?.rewardTiers },
});
export const SAMPLE_MS = 2000;
export const PHONE_WINDOW = 5;
const PHONE_COOLDOWN_MS = 120_000;
/** No heartbeat for this long while the timer runs means the page was closed. */
export const ABANDON_MS = 3 * 60_000;
const PAUSE_GRACE_MS = 30_000;
const END_GRACE_MS = 60_000;

export type CoachMood = "calm" | "angry" | "pleased";
export const COACH_MOODS: CoachMood[] = ["calm", "angry", "pleased"];
export const DEFAULT_COACH_LINES: Record<CoachMood, string> = {
  calm: "来看看你，学得怎么样？",
  angry: "这次被我看到啦，回来继续吧。",
  pleased: "很专心，继续保持！",
};
/** What each face is called wherever the referee picks one. */
export const COACH_MOOD_LABEL: Record<CoachMood, string> = {
  calm: "查岗中",
  angry: "看到走神",
  pleased: "一切正常",
};
/** The duration choices are fixed; old session lengths remain in their snapshots. */
export function minuteChoices(_rules?: Pick<StudyRules, "minutes">) {
  void _rules;
  return [...STUDY_MINUTES];
}
export function studyPoints(rules: StudyRules, minutes: number) {
  return (
    (rules.rewardTiers ?? DEFAULT_STUDY_REWARDS)[minutes as StudyMinutes] ??
    rules.points
  );
}
/** The referee can open the door again only after this long. */
export const VISIT_GAP_MS = 20_000;

export type StrikeKind = "strike" | "warning";
export type LocalSource = "absent" | "phone" | "look_away" | "drowsy";
export type StrikeSource = LocalSource | "ai" | "summary";
/** Every local signal is a reminder, except leaving and phones in strict mode. */
export function localKind(source: LocalSource, rules: StudyRules): StrikeKind {
  return rules.strict && (source === "absent" || source === "phone")
    ? "strike"
    : "warning";
}
/** A recap costs a reminder below 3 in strict mode; otherwise only an empty or off-topic one (1/5). */
export function weakSummary(score: number | null, rules: StudyRules) {
  return score !== null && score < (rules.strict ? 3 : 2);
}
/** What reminders and strikes are called on screen. */
export const KIND_LABEL: Record<StrikeKind, string> = {
  strike: "违规",
  warning: "提醒",
};
export const SOURCE_LABEL: Record<StrikeSource, string> = {
  absent: "离开镜头",
  phone: "手机",
  look_away: "视线偏离",
  drowsy: "闭眼犯困",
  ai: "AI 检查",
  summary: "学习总结",
};
export const duration = (seconds: number) =>
  seconds >= 60 && seconds % 60 === 0
    ? `${seconds / 60} 分钟`
    : `${seconds} 秒`;
export function localReason(source: LocalSource, rules: StudyRules) {
  return {
    absent: `离开镜头超过 ${duration(rules.absentSeconds)}`,
    phone: "镜头里一直有手机",
    look_away: `视线离开学习区域超过 ${duration(rules.lookAwaySeconds)}`,
    drowsy: `闭眼超过 ${duration(rules.drowsySeconds)}，像是睡着了`,
  }[source];
}

export type StudyStrike = {
  id: string;
  at: string;
  kind: StrikeKind;
  source: StrikeSource;
  reason: string;
  confidence: number | null;
  hasSnapshot: boolean;
  overturnedAt: string | null;
  overturnReason: string | null;
};
export type EndReason =
  "completed" | "ended_early" | "pause_exceeded" | "abandoned";
/** The referee opened the door on her screen: which face, what was said, and whether she saw it. */
export type StudyVisit = {
  id: string;
  at: string;
  mood: CoachMood;
  line: string;
  seenAt: string | null;
};
export type StudySession = {
  id: string;
  day: string;
  startedAt: string;
  endsAt: string;
  lastSeenAt: string;
  pausedAt: string | null;
  pausedMs: number;
  pauseUsed: boolean;
  endedAt: string | null;
  endReason: EndReason | null;
  rules: StudyRules;
  layers: { ai: boolean; screen: boolean };
  share: boolean;
  /** What she set out to study, in her words; null when she skipped it. */
  goal: string | null;
  summary: string | null;
  summaryGrade: { score: number | null; tip: string } | null;
  strikes: StudyStrike[];
  visits: StudyVisit[];
};
export type StudyStatus = "active" | "paused" | "summary" | "passed" | "failed";
export type StudyResult = {
  status: StudyStatus;
  strikes: number;
  warnings: number;
  /** Strikes plus warnings converted at warningsPerStrike; overturned events never count. */
  effective: number;
  struckOut: boolean;
  endReason: EndReason | null;
  studiedMinutes: number;
};

/**
 * Derives a session's state at `now`. Ending early, leaving, or overrunning the pause fails it for good.
 * Reaching the strike limit fails it too, but a completed session can still pass if the referee
 * overturns enough strikes, which is why the timer keeps running after the last strike.
 */
export function studyResult(session: StudySession, now: string): StudyResult {
  const counted = session.strikes.filter((s) => !s.overturnedAt);
  const strikes = counted.filter((s) => s.kind === "strike").length,
    warnings = counted.length - strikes;
  const effective =
    strikes +
    Math.floor(warnings / Math.max(1, session.rules.warningsPerStrike));
  const struckOut = effective >= session.rules.maxStrikes;
  const t = Date.parse(now),
    ends = Date.parse(session.endsAt),
    seen = Date.parse(session.lastSeenAt);
  let endReason = session.endReason;
  if (!session.endedAt) {
    if (session.pausedAt) {
      const limit =
        Date.parse(session.pausedAt) +
        session.rules.pauseMinutes * 60_000 +
        PAUSE_GRACE_MS;
      if (t > limit) endReason = "pause_exceeded";
    } else if (t < ends ? t - seen > ABANDON_MS : seen < ends - END_GRACE_MS)
      endReason = "abandoned";
  }
  const status: StudyStatus =
    endReason === "completed"
      ? struckOut
        ? "failed"
        : "passed"
      : endReason
        ? "failed"
        : session.pausedAt
          ? "paused"
          : t >= ends
            ? "summary"
            : "active";
  const stop = Math.min(
    session.endedAt ? Date.parse(session.endedAt) : t,
    session.pausedAt ? Date.parse(session.pausedAt) : Infinity,
    ends,
  );
  const studiedMinutes = Math.max(
    0,
    Math.floor(
      (stop - Date.parse(session.startedAt) - session.pausedMs) / 60_000,
    ),
  );
  return {
    status,
    strikes,
    warnings,
    effective,
    struckOut,
    endReason,
    studiedMinutes,
  };
}

/** What /api/study returns to the page. */
export type StudyView = {
  mode: "live";
  rules: StudyRules;
  coach: {
    lines: Record<CoachMood, string>;
    photos: Partial<Record<CoachMood, string>>;
  };
  /** The configured vision provider, or null when AI checks are unavailable. */
  ai: { id: string; label: string } | null;
  /** Live visits need 003_visits.sql; until it runs the referee sees a setup hint instead. */
  features: { visits: boolean };
  sessions: (StudySession & { result: StudyResult })[];
  serverTime: string;
};

export type StudyOutcome = {
  id?: string;
  startedAt?: string;
  minutes?: number;
  tiered?: boolean;
  dailyRewardLimit?: number;
  day: string;
  passed: boolean;
  failed: boolean;
  points: number;
  penalty: number;
};
/** What a session contributes to the daily settlement: a strike-out costs the penalty right away. */
export function studyOutcome(session: StudySession, now: string): StudyOutcome {
  const r = studyResult(session, now);
  return {
    id: session.id,
    startedAt: session.startedAt,
    minutes: session.rules.minutes,
    tiered: Boolean(session.rules.rewardTiers),
    dailyRewardLimit: session.rules.dailyRewardLimit ?? STUDY_REWARD_LIMIT,
    day: session.day,
    passed: r.status === "passed",
    failed: r.status === "failed" || r.struckOut,
    points: session.rules.points,
    penalty: session.rules.penalty,
  };
}

/** Replay rewards in start order: all duration tiers share the day's reward limit.
 * Legacy-only days retain their original once-per-day reward. A legacy reward on the
 * upgrade day also consumes one slot. No duplicate ID can earn or consume twice.
 */
export function studyRewards(outcomes: StudyOutcome[]) {
  const ordered = [...outcomes].sort(
    (a, b) =>
      (a.startedAt ?? "").localeCompare(b.startedAt ?? "") ||
      (a.id ?? "").localeCompare(b.id ?? ""),
  );
  const limits = new Map<string, number>();
  for (const o of ordered)
    if (o.tiered && !limits.has(o.day))
      limits.set(o.day, o.dailyRewardLimit ?? STUDY_REWARD_LIMIT);
  const used = new Map<string, number>(),
    seen = new Set<string>(),
    legacyPaid = new Set<string>();
  return ordered.flatMap((o) => {
    if (o.id && seen.has(o.id)) return [];
    if (o.id) seen.add(o.id);
    if (!o.passed) return [];
    const count = used.get(o.day) ?? 0;
    if (
      count >= (limits.get(o.day) ?? 1) ||
      (!o.tiered && legacyPaid.has(o.day))
    )
      return [];
    used.set(o.day, count + 1);
    if (!o.tiered) legacyPaid.add(o.day);
    return [o];
  });
}

export type Verdict = {
  studying: boolean;
  category: "study" | "entertainment" | "chat" | "away" | "unclear";
  confidence: number;
  reason: string;
};
/** Only confident judgments cost anything; "unclear" never does. */
export function inspectionAction(
  v: Verdict,
  rules: Pick<StudyRules, "strict" | "aiConfidence">,
): StrikeKind | null {
  const lapse = v.category === "entertainment" || v.category === "away";
  if (rules.strict) {
    if (lapse)
      return v.confidence >= 0.7
        ? "strike"
        : v.confidence >= 0.5
          ? "warning"
          : null;
    return v.category === "chat" && v.confidence >= 0.5 ? "warning" : null;
  }
  // Gentle mode: an unmistakable lapse earns a reminder, never a strike by itself.
  if (lapse) return v.confidence >= rules.aiConfidence ? "warning" : null;
  return v.category === "chat" &&
    v.confidence >= Math.max(0.9, rules.aiConfidence)
    ? "warning"
    : null;
}

export function inspectionDelay(rules: StudyRules, random = Math.random) {
  const low = Math.min(rules.minGap, rules.maxGap),
    high = Math.max(rules.minGap, rules.maxGap);
  return Math.round((low + random() * (high - low)) * 60_000);
}

/** Yaw and pitch in degrees from MediaPipe's 4×4 facial transformation matrix (column-major). */
export function headPose(m: ArrayLike<number>) {
  const deg = 180 / Math.PI;
  return {
    yaw: Math.atan2(-m[2], Math.hypot(m[6], m[10])) * deg,
    pitch: Math.atan2(m[6], m[10]) * deg,
  };
}

export type Pose = { yaw: number; pitch: number };
/** The median pose while looking at the study material; null when the face was rarely visible. */
export function calibrate(samples: (Pose | null)[]): Pose | null {
  const seen = samples.filter((s): s is Pose => s !== null);
  if (!samples.length || seen.length / samples.length < 0.6) return null;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2
      ? s[s.length >> 1]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  return {
    yaw: median(seen.map((s) => s.yaw)),
    pitch: median(seen.map((s) => s.pitch)),
  };
}

export type Sample = {
  t: number;
  present: boolean;
  phone: boolean;
  pose: Pose | null;
  blink: number | null;
};
/** Turns ~2 s camera samples into events. Each timer restarts after it fires, so a long lapse repeats. */
export class SignalTracker {
  private absentSince: number | null = null;
  private awaySince: number | null = null;
  private drowsySince: number | null = null;
  private phones: boolean[] = [];
  private lastPhone = -Infinity;
  constructor(
    private rules: StudyRules,
    private baseline: Pose | null,
  ) {}
  reset() {
    this.absentSince = this.awaySince = this.drowsySince = null;
    this.phones = [];
  }
  update(s: Sample): LocalSource[] {
    const events: LocalSource[] = [],
      r = this.rules;
    const elapsed = (since: number | null, seconds: number) =>
      since !== null && s.t - since >= seconds * 1000;
    this.absentSince = s.present ? null : (this.absentSince ?? s.t);
    if (elapsed(this.absentSince, r.absentSeconds)) {
      events.push("absent");
      this.absentSince = s.t;
    }
    this.phones = [...this.phones, s.phone].slice(-PHONE_WINDOW);
    if (
      this.phones.filter(Boolean).length >= r.phoneHits &&
      s.t - this.lastPhone >= PHONE_COOLDOWN_MS
    ) {
      events.push("phone");
      this.lastPhone = s.t;
      this.phones = [];
    }
    // A zero duration switches that check off.
    const away =
      r.lookAwaySeconds > 0 &&
      s.present &&
      s.pose !== null &&
      this.baseline !== null &&
      (Math.abs(s.pose.yaw - this.baseline.yaw) > r.yawTolerance ||
        Math.abs(s.pose.pitch - this.baseline.pitch) > r.pitchTolerance);
    this.awaySince = away ? (this.awaySince ?? s.t) : null;
    if (elapsed(this.awaySince, r.lookAwaySeconds)) {
      events.push("look_away");
      this.awaySince = s.t;
    }
    const drowsy =
      r.drowsySeconds > 0 &&
      s.present &&
      s.blink !== null &&
      s.blink > r.blinkThreshold;
    this.drowsySince = drowsy ? (this.drowsySince ?? s.t) : null;
    if (elapsed(this.drowsySince, r.drowsySeconds)) {
      events.push("drowsy");
      this.drowsySince = s.t;
    }
    return events;
  }
}
