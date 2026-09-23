import { z } from "zod";
import { getJd } from "@/lib/server/docs";
import { transact } from "@/lib/server/repository";
import {
  errorResponse,
  HttpError,
  isDemo,
  member,
  requireUser,
} from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** The job description she saved with an application, for her and for the referee. */
export async function GET(request: Request) {
  try {
    if (isDemo()) throw new HttpError("演示模式不保存职位描述", 503);
    const user = await requireUser();
    const state = await transact(undefined, new Date().toISOString());
    member(state, user);
    const logId = new URL(request.url).searchParams.get("log") ?? "";
    if (!z.uuid().safeParse(logId).success)
      throw new HttpError("找不到这条记录", 404);
    const log = Object.values(state.days)
      .flatMap((day) => day.logs)
      .find((entry) => entry.id === logId);
    const text = log?.jd ? await getJd(logId) : null;
    if (!log?.jd || !text) throw new HttpError("找不到这份职位描述", 404);
    return Response.json(
      { text, company: log.company, link: log.link, at: log.jd.at },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
