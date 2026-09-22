import { z } from "zod";
import { transact } from "@/lib/server/repository";
import { getImage, getStrike } from "@/lib/server/study";
import {
  errorResponse,
  HttpError,
  isDemo,
  member,
  requireUser,
} from "@/lib/server/supabase";
import { COACH_MOODS, type CoachMood } from "@/lib/study";

export const dynamic = "force-dynamic";
// Coach photos and violation snapshots stay in a private bucket; only the player and referee reach them here.
export async function GET(request: Request) {
  try {
    if (isDemo()) throw new HttpError("演示模式不支持学习模式", 503);
    const user = await requireUser();
    const state = await transact(undefined, new Date().toISOString());
    member(state, user);
    const params = new URL(request.url).searchParams,
      mood = params.get("coach") as CoachMood | null,
      strikeId = params.get("snapshot");
    let path: string | null = null,
      cache = "private, no-store";
    if (mood && COACH_MOODS.includes(mood) && state.coach?.photos?.[mood]) {
      path = `coach/${mood}.jpg`;
      // Photo URLs carry the upload version, so a replaced photo gets a new URL.
      cache = "private, max-age=31536000, immutable";
    } else if (strikeId && z.uuid().safeParse(strikeId).success)
      path = (await getStrike(strikeId))?.snapshot_path ?? null;
    const image = path && (await getImage(path));
    if (!image) throw new HttpError("找不到这张图片", 404);
    return new Response(image, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
