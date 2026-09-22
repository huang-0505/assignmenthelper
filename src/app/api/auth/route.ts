import { z } from "zod";
import { claimPlayer, nameSchema } from "@/lib/actions";
import { transact } from "@/lib/server/repository";
import { clearSession, isRefereeKey, writeSession } from "@/lib/server/session";
import {
  isConfigured,
  isDemo,
  verifyOrigin,
  errorResponse,
  HttpError,
} from "@/lib/server/supabase";
const entrySchema = z.object({
  name: nameSchema,
  key: z.string().max(200).optional(),
});
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const body = await request.json();
    if (body?.type === "logout") {
      await clearSession();
      return Response.json({ ok: true });
    }
    if (isDemo()) throw new HttpError("演示模式无需输入名字", 400);
    if (!isConfigured())
      throw new HttpError("请先配置 Supabase 和 REFEREE_KEY", 503);
    const parsed = entrySchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(parsed.error.issues[0]?.message || "请输入名字", 400);
    const { name, key } = parsed.data;
    if (key !== undefined) {
      if (!isRefereeKey(key))
        throw new HttpError("裁判入口链接无效，请确认链接完整", 403);
      await writeSession({ role: "referee", name });
      return Response.json({ ok: true });
    }
    let player = name;
    await transact((state) => {
      player = claimPlayer(state, name);
    });
    await writeSession({ role: "player", name: player });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
