import "server-only";
import {
  studyOutcome,
  studyResult,
  type EndReason,
  type StrikeKind,
  type StrikeSource,
  type StudyOutcome,
  type StudyRules,
  type StudySession,
} from "../study";
import { adminClient } from "./supabase";

// Snapshots and coach photos share one private bucket; only the server's service role can read it.
const BUCKET = "study-media";
export class StudyNotReady extends Error {}

type StrikeRow = {
  id: string;
  session_id: string;
  at: string;
  kind: StrikeKind;
  source: StrikeSource;
  reason: string;
  confidence: number | null;
  snapshot_path: string | null;
  overturned_at: string | null;
  overturn_reason: string | null;
};
type SessionRow = {
  id: string;
  day: string;
  started_at: string;
  ends_at: string;
  last_seen_at: string;
  paused_at: string | null;
  paused_ms: number;
  pause_used: boolean;
  ended_at: string | null;
  end_reason: EndReason | null;
  rules: StudyRules;
  layers: { ai: boolean; screen: boolean };
  share_snapshots: boolean;
  summary: string | null;
  summary_grade: { score: number | null; tip: string } | null;
  last_inspect_at: string | null;
  study_strikes: StrikeRow[];
};
export type SessionRecord = StudySession & { lastInspectAt: string | null };

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    day: row.day,
    startedAt: iso(row.started_at)!,
    endsAt: iso(row.ends_at)!,
    lastSeenAt: iso(row.last_seen_at)!,
    pausedAt: iso(row.paused_at),
    pausedMs: row.paused_ms,
    pauseUsed: row.pause_used,
    endedAt: iso(row.ended_at),
    endReason: row.end_reason,
    rules: row.rules,
    layers: row.layers,
    share: row.share_snapshots,
    summary: row.summary,
    summaryGrade: row.summary_grade,
    lastInspectAt: iso(row.last_inspect_at),
    strikes: [...row.study_strikes]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((s) => ({
        id: s.id,
        at: iso(s.at)!,
        kind: s.kind,
        source: s.source,
        reason: s.reason,
        confidence: s.confidence,
        hasSnapshot: Boolean(s.snapshot_path),
        overturnedAt: iso(s.overturned_at),
        overturnReason: s.overturn_reason,
      })),
  };
}
function fail(error: { code?: string } | null, message: string): never {
  // Before 002_study.sql runs, PostgREST reports the tables as missing.
  if (error?.code === "PGRST205" || error?.code === "42P01")
    throw new StudyNotReady();
  throw new Error(message);
}

const table = () => adminClient().from("study_sessions");
export async function listSessions(): Promise<SessionRecord[]> {
  const { data, error } = await table()
    .select("*, study_strikes(*)")
    .order("started_at", { ascending: false });
  if (error) fail(error, "无法读取学习记录");
  return (data as SessionRow[]).map(toSession);
}
export async function getSession(id: string) {
  const { data, error } = await table()
    .select("*, study_strikes(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error, "无法读取这次学习");
  return data ? toSession(data as SessionRow) : null;
}
export async function createSession(row: Omit<SessionRow, "study_strikes">) {
  const { error } = await table().insert(row);
  if (error?.code === "23505") throw new Error("你还有一场学习没有结束");
  if (error) fail(error, "无法开始学习，请重试");
}
export async function updateSession(
  id: string,
  patch: Partial<Omit<SessionRow, "id" | "study_strikes">>,
) {
  const { error } = await table().update(patch).eq("id", id);
  if (error) fail(error, "学习记录保存失败，请重试");
}
export async function insertStrike(row: StrikeRow) {
  const { error } = await adminClient().from("study_strikes").insert(row);
  // A retried request reuses its id, so a duplicate is the same event arriving twice.
  if (error && error.code !== "23505") fail(error, "违规记录保存失败");
}
export async function getStrike(id: string) {
  const { data, error } = await adminClient()
    .from("study_strikes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error, "无法读取违规记录");
  return data as StrikeRow | null;
}
export async function overturnStrike(id: string, reason: string, at: string) {
  const { error } = await adminClient()
    .from("study_strikes")
    .update({ overturned_at: at, overturn_reason: reason })
    .eq("id", id)
    .is("overturned_at", null);
  if (error) fail(error, "推翻失败，请重试");
}
export async function clearSnapshots() {
  const db = adminClient();
  const { data, error } = await db
    .from("study_strikes")
    .select("id, snapshot_path")
    .not("snapshot_path", "is", null);
  if (error) fail(error, "无法读取截图");
  const paths = (data as { snapshot_path: string }[]).map(
    (r) => r.snapshot_path,
  );
  if (paths.length) {
    await ensureBucket();
    const removed = await db.storage.from(BUCKET).remove(paths);
    if (removed.error) throw new Error("截图删除失败，请重试");
    const cleared = await db
      .from("study_strikes")
      .update({ snapshot_path: null })
      .not("snapshot_path", "is", null);
    if (cleared.error) fail(cleared.error, "截图删除失败，请重试");
  }
  return paths.length;
}

/** Persists ends that can only be derived (left the page, pause overran) so a new session can start. */
export async function finalize(session: SessionRecord, now: string) {
  const r = studyResult(session, now);
  if (session.endedAt || !r.endReason) return session;
  const endedAt =
    r.endReason === "pause_exceeded"
      ? new Date(
          Date.parse(session.pausedAt!) + session.rules.pauseMinutes * 60_000,
        ).toISOString()
      : session.lastSeenAt;
  await updateSession(session.id, {
    ended_at: endedAt,
    end_reason: r.endReason,
    paused_at: null,
  });
  return { ...session, endedAt, endReason: r.endReason, pausedAt: null };
}
export async function loadSessions(now: string) {
  return Promise.all((await listSessions()).map((s) => finalize(s, now)));
}
/** Study outcomes for the settlement; an app without the study tables yet simply has none. */
export async function loadOutcomes(now: string): Promise<StudyOutcome[]> {
  try {
    return (await listSessions()).map((s) => studyOutcome(s, now));
  } catch (error) {
    if (error instanceof StudyNotReady) return [];
    throw error;
  }
}

let bucket: Promise<void> | null = null;
function ensureBucket() {
  bucket ??= (async () => {
    const storage = adminClient().storage;
    if (!(await storage.getBucket(BUCKET)).error) return;
    const { error } = await storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "2MB",
      allowedMimeTypes: ["image/jpeg"],
    });
    if (error && !/exist/i.test(error.message))
      throw new Error("无法创建图片存储空间");
  })().catch((error) => {
    bucket = null;
    throw error;
  });
  return bucket;
}
/** Accepts only a base64 JPEG within `maxBytes`; frames never arrive as anything else. */
export function jpegBytes(base64: string, maxBytes: number) {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 100 || bytes.length > maxBytes)
    throw new Error("图片大小不符合要求");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
    throw new Error("只支持 JPEG 图片");
  return bytes;
}
export async function putImage(path: string, bytes: Uint8Array) {
  await ensureBucket();
  const { error } = await adminClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("图片保存失败，请重试");
}
export async function getImage(path: string) {
  await ensureBucket();
  const { data } = await adminClient().storage.from(BUCKET).download(path);
  return data;
}
export async function removeImage(path: string) {
  await ensureBucket();
  await adminClient().storage.from(BUCKET).remove([path]);
}
