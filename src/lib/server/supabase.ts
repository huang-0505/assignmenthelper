import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sameName } from "../actions";
import type { GameState } from "../types";
import { readSession, type Session } from "./session";

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.REFEREE_KEY,
  );
}
export function isDemo() {
  return (
    process.env.DEMO_MODE === "true" ||
    (!isConfigured() && process.env.NODE_ENV !== "production")
  );
}
export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function requireUser() {
  if (!isConfigured())
    throw new HttpError(
      "请先配置 Supabase 和 REFEREE_KEY 环境变量。也可以在本地启用 DEMO_MODE。",
      503,
    );
  const session = await readSession();
  if (!session) throw new HttpError("请先输入名字进入训练营", 401);
  return { id: session.role, ...session };
}
/** A player session counts only while its name still matches the claimed player name. */
export function member<T extends Session>(state: GameState, user: T): T {
  if (user.role === "referee") return user;
  if (!state.playerName || !sameName(state.playerName, user.name))
    throw new HttpError("请重新输入名字进入训练营", 403);
  return { ...user, name: state.playerName };
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError("请求来源不匹配，请从应用页面重新操作", 403);
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        error instanceof Error && error.name === "Error"
          ? error.message
          : "操作失败，请刷新后重试",
    },
    { status: 400 },
  );
}
