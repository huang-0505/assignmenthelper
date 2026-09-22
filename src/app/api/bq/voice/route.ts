import { z } from "zod";
import { bank } from "@/lib/server/bank";
import { snapshot, transact } from "@/lib/server/repository";
import {
  audioBytes,
  getVoice,
  loadOutcomes,
  putVoice,
  VOICE_TYPES,
} from "@/lib/server/study";
import {
  errorResponse,
  HttpError,
  isDemo,
  member,
  requireUser,
  verifyOrigin,
} from "@/lib/server/supabase";
import { advance } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_BYTES = 5_000_000,
  MAX_SECONDS = 95;
const bodySchema = z.object({
  date: z.iso.date(),
  mime: z.enum(VOICE_TYPES),
  seconds: z.number().int().min(1).max(MAX_SECONDS),
  audio: z.string().max(7_000_000),
});
const extension = (mime: string) =>
  ({
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
  })[mime] ?? "bin";

/** She records herself telling today's BQ story. At the practice stage that completes the task. */
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (isDemo()) throw new HttpError("演示模式不支持录音", 503);
    const user = await requireUser();
    if (user.role !== "player") throw new HttpError("只有玩家可以录音", 403);
    const raw = await request.text();
    if (raw.length > 7_100_000) throw new HttpError("录音太大，请录短一点", 413);
    const parsed = bodySchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new HttpError(parsed.error.issues[0]?.message || "录音格式不对", 400);
    const body = parsed.data,
      now = new Date().toISOString();
    const bytes = audioBytes(body.audio, body.mime, MAX_BYTES);
    const path = `bq/${body.date}.${extension(body.mime)}`;
    // Check the day before touching storage, so a stale page cannot leave a stray file.
    const current = await transact(undefined, now);
    member(current, user);
    if (advance(current, now, bank) !== body.date)
      throw new HttpError("这一天已经结束，请刷新后记录今天的练习", 409);
    if (!current.days[body.date].bq)
      throw new HttpError("今天没有 BQ 练习", 409);
    await putVoice(path, bytes, body.mime);
    const study = await loadOutcomes(now);
    const state = await transact((s) => {
      const bq = s.days[body.date].bq!;
      bq.voice = { at: now, seconds: body.seconds, mime: body.mime };
      if (bq.stage === 2) {
        bq.practiced = true;
        bq.completedAt = now;
      }
      s.audit.push({
        id: crypto.randomUUID(),
        at: now,
        actor: user.id,
        action: "bqVoice",
        date: body.date,
        detail: `录了 BQ 口述，${body.seconds} 秒`,
      });
    }, now);
    return Response.json(snapshot(state, member(state, user), now, study));
  } catch (error) {
    return errorResponse(error);
  }
}

/** The recording itself, for her and for the referee. */
export async function GET(request: Request) {
  try {
    if (isDemo()) throw new HttpError("演示模式不支持录音", 503);
    const user = await requireUser();
    const state = await transact(undefined, new Date().toISOString());
    member(state, user);
    const date = new URL(request.url).searchParams.get("date") ?? "";
    const voice = z.iso.date().safeParse(date).success
      ? state.days[date]?.bq?.voice
      : undefined;
    const audio = voice && (await getVoice(`bq/${date}.${extension(voice.mime)}`));
    if (!voice || !audio) throw new HttpError("找不到这段录音", 404);
    return new Response(audio, {
      headers: {
        "Content-Type": voice.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
