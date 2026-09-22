import { z } from "zod";
import {
  authClient,
  isConfigured,
  verifyOrigin,
  errorResponse,
  HttpError,
} from "@/lib/server/supabase";
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (!isConfigured()) throw new HttpError("请先配置 Supabase", 503);
    const client = await authClient(),
      body = await request.json();
    if (body.type === "logout") {
      await client.auth.signOut();
      return Response.json({ ok: true });
    }
    const parsed = z
      .object({ email: z.email(), password: z.string().min(1).max(128) })
      .safeParse(body);
    if (!parsed.success) throw new HttpError("请输入有效邮箱和密码", 400);
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error) throw new HttpError("登录失败，请检查邮箱和密码后重试", 401);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
