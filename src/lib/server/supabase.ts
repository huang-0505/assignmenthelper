import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Role } from "../types";

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
export function isDemo() {
  return (
    process.env.DEMO_MODE === "true" ||
    (!isConfigured() && process.env.NODE_ENV !== "production")
  );
}
export async function authClient() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) =>
          items.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          ),
      },
    },
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
      "请先配置 Supabase 环境变量。也可以在本地启用 DEMO_MODE。",
      503,
    );
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new HttpError("请先登录", 401);
  const { data: profile } = await client
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();
  if (!profile)
    throw new HttpError("此账号还未被设为玩家或裁判，请联系应用管理员", 403);
  return {
    id: user.id,
    role: profile.role as Role,
    name: profile.display_name as string,
  };
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
