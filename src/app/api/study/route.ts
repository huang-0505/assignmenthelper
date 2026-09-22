import { z } from "zod";
import { gradeAnswer, llmConfig } from "@/lib/grading";
import { transact } from "@/lib/server/repository";
import {
  clearSnapshots,
  createSession,
  finalize,
  getSession,
  getStrike,
  insertStrike,
  insertVisit,
  jpegBytes,
  loadSessions,
  markVisitSeen,
  overturnStrike,
  putImage,
  removeImage,
  StudyNotReady,
  updateSession,
  visitsReady,
  VisitsNotReady,
  type SessionRecord,
} from "@/lib/server/study";
import {
  errorResponse,
  HttpError,
  isDemo,
  member,
  requireUser,
  verifyOrigin,
} from "@/lib/server/supabase";
import { visionProvider, type Frame } from "@/lib/server/vision";
import {
  COACH_MOOD_LABEL,
  COACH_MOODS,
  DEFAULT_COACH_LINES,
  inspectionAction,
  localKind,
  localReason,
  minuteChoices,
  studyResult,
  VISIT_GAP_MS,
  weakSummary,
  withDefaults,
  type StudyRules,
  type StudyView,
} from "@/lib/study";
import type { GameState, Question } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FRAME_BYTES = 400_000,
  PHOTO_BYTES = 1_500_000,
  INSPECT_GAP_MS = 45_000;
// Graded by the same model chain as interview answers; the rubric describes a useful recap.
const SUMMARY: Question = {
  id: "study-summary",
  category: "Project",
  difficulty: "Easy",
  prompt:
    "In three short lines, summarize what you learned in this study session.",
  rubric: [
    "Names the concrete topic or material studied",
    "States at least one specific takeaway, method, or fact learned",
    "Notes a next step, open question, or how it applies to interviews",
  ],
};
const sessionId = z.uuid(),
  image = z.string().max(2_100_000);
const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    ai: z.boolean(),
    screen: z.boolean(),
    share: z.boolean(),
    goal: z.string().trim().max(80, "这场的目标最多 80 个字").optional(),
    minutes: z.number().int().optional(),
  }),
  z.object({ type: z.literal("heartbeat"), sessionId }),
  z.object({
    type: z.literal("visit"),
    sessionId,
    mood: z.enum(COACH_MOODS),
    line: z.string().trim().min(1, "说一句话再开门").max(120, "最多 120 个字"),
  }),
  z.object({ type: z.literal("visitSeen"), sessionId, visitId: z.uuid() }),
  z.object({
    type: z.literal("event"),
    sessionId,
    id: z.uuid(),
    source: z.enum(["absent", "phone", "look_away", "drowsy"]),
    snapshot: image.optional(),
  }),
  z.object({
    type: z.literal("inspect"),
    sessionId,
    camera: image,
    screen: image.optional(),
  }),
  z.object({ type: z.literal("pause"), sessionId }),
  z.object({ type: z.literal("resume"), sessionId }),
  z.object({ type: z.literal("end"), sessionId }),
  z.object({
    type: z.literal("finish"),
    sessionId,
    summary: z.string().trim().min(10, "学习总结至少写 10 个字").max(2000),
  }),
  z.object({ type: z.literal("share"), sessionId, share: z.boolean() }),
  z.object({ type: z.literal("deleteSnapshots") }),
  z.object({
    type: z.literal("overturn"),
    strikeId: z.uuid(),
    reason: z.string().trim().min(3, "请写下推翻的理由").max(1000),
  }),
  z.object({
    type: z.literal("coachPhoto"),
    mood: z.enum(COACH_MOODS),
    image: image.nullable(),
  }),
]);
type Body = z.infer<typeof bodySchema>;
const REFEREE_ONLY = new Set<Body["type"]>([
  "overturn",
  "coachPhoto",
  "visit",
]);

const today = (state: GameState) => Object.keys(state.days).sort().at(-1)!;
function todayRules(state: GameState): StudyRules {
  return withDefaults(
    state.days[today(state)].settings.study ?? state.settings.study,
  );
}
const later = (at: string, ms: number) =>
  new Date(Date.parse(at) + ms).toISOString();
const noStore = { headers: { "Cache-Control": "no-store" } };

function payload(
  state: GameState,
  sessions: SessionRecord[],
  now: string,
): StudyView {
  const provider = visionProvider();
  return {
    mode: "live",
    rules: todayRules(state),
    coach: {
      lines: { ...DEFAULT_COACH_LINES, ...state.coach?.lines },
      photos: state.coach?.photos ?? {},
    },
    ai: provider ? { id: provider.id, label: provider.label } : null,
    features: { visits: visitsReady() },
    sessions: sessions.map((s) => ({ ...s, result: studyResult(s, now) })),
    serverTime: now,
  };
}

export async function GET() {
  if (isDemo()) return Response.json({ mode: "demo" }, noStore);
  try {
    const user = await requireUser();
    const now = new Date().toISOString();
    const state = await transact(undefined, now);
    member(state, user);
    return Response.json(payload(state, await loadSessions(now), now), noStore);
  } catch (error) {
    if (error instanceof StudyNotReady)
      return Response.json({ mode: "setup" }, noStore);
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (isDemo()) throw new HttpError("演示模式不支持学习模式", 503);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 4_500_000) throw new HttpError("提交内容太大", 413);
    const parsed = bodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new HttpError(
        parsed.error.issues[0]?.message || "请求格式不正确",
        400,
      );
    const body = parsed.data;
    if (REFEREE_ONLY.has(body.type) !== (user.role === "referee"))
      throw new HttpError("你的角色没有这项操作的权限", 403);
    const now = new Date().toISOString();
    let state = await transact(undefined, now);
    member(state, user);
    const extra = await handle(body, state, now, (next) => (state = next));
    // Coach photos don't need the study tables, so they work before 002_study.sql runs.
    const sessions = await loadSessions(now).catch((error) => {
      if (error instanceof StudyNotReady && body.type === "coachPhoto")
        return [];
      throw error;
    });
    return Response.json(
      { ...payload(state, sessions, now), ...extra },
      noStore,
    );
  } catch (error) {
    if (error instanceof StudyNotReady)
      return Response.json(
        { error: "请先在 Supabase 执行 002_study.sql 迁移" },
        { status: 503 },
      );
    if (error instanceof VisitsNotReady)
      return Response.json(
        { error: "真人查岗需要先在 Supabase 执行 003_visits.sql 迁移" },
        { status: 503 },
      );
    return errorResponse(error);
  }
}

async function handle(
  body: Body,
  state: GameState,
  now: string,
  setState: (state: GameState) => void,
): Promise<Record<string, unknown>> {
  switch (body.type) {
    case "start": {
      const sessions = await loadSessions(now);
      if (sessions.some((s) => !s.endedAt))
        throw new HttpError("你还有一场学习没有结束", 409);
      const base = todayRules(state);
      if (body.minutes && !minuteChoices(base).includes(body.minutes))
        throw new HttpError("这个时长不在可选范围内", 400);
      // Her chosen length is part of this session's rules; the points and penalty stay the same.
      const rules = { ...base, minutes: body.minutes ?? base.minutes };
      await createSession({
        id: crypto.randomUUID(),
        day: today(state),
        started_at: now,
        ends_at: later(now, rules.minutes * 60_000),
        last_seen_at: now,
        paused_at: null,
        paused_ms: 0,
        pause_used: false,
        ended_at: null,
        end_reason: null,
        rules,
        // AI checks need both her consent and a configured provider.
        layers: {
          ai: body.ai && Boolean(visionProvider()),
          screen: body.screen,
        },
        share_snapshots: body.share,
        goal: body.goal || null,
        summary: null,
        summary_grade: null,
        last_inspect_at: null,
      });
      return {};
    }
    case "deleteSnapshots":
      return { deleted: await clearSnapshots() };
    case "overturn": {
      const strike = await getStrike(body.strikeId);
      if (!strike) throw new HttpError("找不到这条违规记录", 404);
      if (strike.overturned_at)
        throw new HttpError("这条记录已经推翻过了", 409);
      await overturnStrike(strike.id, body.reason, now);
      const session = await getSession(strike.session_id);
      setState(
        await transact((s) => {
          s.audit.push({
            id: crypto.randomUUID(),
            at: now,
            actor: "referee",
            action: "studyOverturn",
            date: session?.day,
            detail: `推翻学习模式违规「${strike.reason}」：${body.reason}`,
          });
        }, now),
      );
      return {};
    }
    case "coachPhoto": {
      const path = `coach/${body.mood}.jpg`;
      if (body.image) await putImage(path, jpegBytes(body.image, PHOTO_BYTES));
      else await removeImage(path);
      setState(
        await transact((s) => {
          const photos = { ...s.coach?.photos };
          if (body.image) photos[body.mood] = Date.now().toString(36);
          else delete photos[body.mood];
          s.coach = { ...s.coach, photos };
          s.audit.push({
            id: crypto.randomUUID(),
            at: now,
            actor: "referee",
            action: "coachPhoto",
            detail: `${body.image ? "更新" : "删除"}了教练照片（${COACH_MOOD_LABEL[body.mood]}）`,
          });
        }, now),
      );
      return {};
    }
  }
  const found = await getSession(body.sessionId);
  if (!found) throw new HttpError("找不到这次学习", 404);
  const session = await finalize(found, now),
    result = studyResult(session, now),
    rules = withDefaults(session.rules),
    id = session.id;
  if (session.endedAt) throw new HttpError("这次学习已经结束了", 409);
  switch (body.type) {
    case "heartbeat": {
      await updateSession(id, { last_seen_at: now });
      // The page polls with heartbeats; a visit she has not seen yet rides back on the reply.
      const visit = session.visits.findLast((v) => !v.seenAt);
      return visit ? { visit } : {};
    }
    case "visitSeen":
      await markVisitSeen(body.visitId, id, now);
      return {};
    case "visit": {
      if (result.status === "paused")
        throw new HttpError("她暂停了，摄像头关着，等她回来再去", 409);
      if (result.status !== "active")
        throw new HttpError("她已经下课了", 409);
      const last = session.visits.at(-1);
      if (last && Date.parse(now) - Date.parse(last.at) < VISIT_GAP_MS)
        throw new HttpError("刚去过，过一会儿再去", 429);
      const visit = {
        id: crypto.randomUUID(),
        session_id: id,
        at: now,
        mood: body.mood,
        line: body.line,
        seen_at: null,
      };
      await insertVisit(visit);
      setState(
        await transact((s) => {
          s.audit.push({
            id: crypto.randomUUID(),
            at: now,
            actor: "referee",
            action: "studyVisit",
            date: session.day,
            detail: `去后门看了她（${COACH_MOOD_LABEL[body.mood]}）：${body.line}`,
          });
        }, now),
      );
      return { visit: { ...visit, seenAt: null } };
    }
    case "share":
      await updateSession(id, { share_snapshots: body.share });
      return {};
    case "event": {
      if (result.status !== "active")
        throw new HttpError("现在不能记录违规", 409);
      // The browser samples every 2 s; a second report for the same lapse is ignored.
      const gapSeconds = {
        absent: rules.absentSeconds,
        phone: 100,
        look_away: rules.lookAwaySeconds,
        drowsy: rules.drowsySeconds,
      }[body.source];
      const last = session.strikes.findLast((s) => s.source === body.source);
      // A check the referee switched off (0 s) never records anything.
      if (
        gapSeconds > 0 &&
        (!last || Date.parse(now) - Date.parse(last.at) >= gapSeconds * 800)
      ) {
        const kind = localKind(body.source, rules);
        // With sharing on, every recorded lapse keeps one small camera frame for the referee.
        const snapshot =
          session.share && body.snapshot
            ? `snapshots/${id}/${body.id}.jpg`
            : null;
        if (snapshot)
          await putImage(snapshot, jpegBytes(body.snapshot!, FRAME_BYTES));
        await insertStrike({
          id: body.id,
          session_id: id,
          at: now,
          kind,
          source: body.source,
          reason: localReason(body.source, rules),
          confidence: null,
          snapshot_path: snapshot,
          overturned_at: null,
          overturn_reason: null,
        });
      }
      await updateSession(id, { last_seen_at: now });
      return {};
    }
    case "inspect": {
      if (result.status !== "active") throw new HttpError("现在不能检查", 409);
      const provider = visionProvider();
      if (!session.layers.ai || !provider)
        throw new HttpError("这次学习没有开启 AI 检查", 400);
      const lastInspect = found.lastInspectAt;
      if (
        lastInspect &&
        Date.parse(now) - Date.parse(lastInspect) < INSPECT_GAP_MS
      )
        throw new HttpError("检查太频繁，请稍后再试", 429);
      jpegBytes(body.camera, FRAME_BYTES);
      await updateSession(id, { last_inspect_at: now, last_seen_at: now });
      const frames: Frame[] = [{ kind: "camera", jpeg: body.camera }];
      if (body.screen && session.layers.screen) {
        jpegBytes(body.screen, FRAME_BYTES * 2);
        frames.push({ kind: "screen", jpeg: body.screen });
      }
      // Frames go to the provider for this judgment only; nothing is kept unless a shared strike needs it.
      const verdict = await provider.judge(frames).catch(() => null);
      if (!verdict) return { inspection: { unavailable: true } };
      const kind = inspectionAction(verdict, rules);
      if (kind) {
        const strikeId = crypto.randomUUID();
        const snapshot = session.share
          ? `snapshots/${id}/${strikeId}.jpg`
          : null;
        if (snapshot)
          await putImage(snapshot, jpegBytes(body.camera, FRAME_BYTES));
        await insertStrike({
          id: strikeId,
          session_id: id,
          at: now,
          kind,
          source: "ai",
          reason: verdict.reason,
          confidence: verdict.confidence,
          snapshot_path: snapshot,
          overturned_at: null,
          overturn_reason: null,
        });
      }
      return { inspection: { verdict, kind } };
    }
    case "pause":
      if (result.status !== "active") throw new HttpError("现在不能暂停", 409);
      if (session.pauseUsed || rules.pauseMinutes <= 0)
        throw new HttpError("每次学习只能暂停一次", 409);
      await updateSession(id, {
        paused_at: now,
        pause_used: true,
        last_seen_at: now,
      });
      return {};
    case "resume": {
      if (result.status !== "paused") throw new HttpError("现在没有暂停", 409);
      const paused = Date.parse(now) - Date.parse(session.pausedAt!);
      await updateSession(id, {
        paused_at: null,
        paused_ms: session.pausedMs + paused,
        ends_at: later(session.endsAt, paused),
        last_seen_at: now,
      });
      return {};
    }
    case "end":
      if (result.status === "summary")
        throw new HttpError("时间到了，请先写学习总结", 409);
      await updateSession(id, {
        ended_at: now,
        end_reason: "ended_early",
        paused_at: null,
      });
      return {};
    case "finish": {
      if (result.status !== "summary")
        throw new HttpError("还没到时间，不能提交总结", 409);
      const grade = await gradeAnswer(SUMMARY, body.summary, llmConfig());
      if (weakSummary(grade.score, rules))
        await insertStrike({
          id: crypto.randomUUID(),
          session_id: id,
          at: now,
          kind: "warning",
          source: "summary",
          reason: `学习总结得分 ${grade.score} / 5，${rules.strict ? "低于 3 分" : "内容太少或和学习无关"}`,
          confidence: null,
          snapshot_path: null,
          overturned_at: null,
          overturn_reason: null,
        });
      await updateSession(id, {
        ended_at: now,
        end_reason: "completed",
        summary: body.summary,
        summary_grade: { score: grade.score, tip: grade.tip },
        last_seen_at: now,
      });
      return { grade: { score: grade.score, tip: grade.tip } };
    }
  }
}
