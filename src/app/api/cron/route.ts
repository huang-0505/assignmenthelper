import { timingSafeEqual } from "node:crypto";
import { transact } from "@/lib/server/repository";
import { isConfigured, isDemo } from "@/lib/server/supabase";
import { evaluate } from "@/lib/engine";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const token = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ""}`);
  if (
    !process.env.CRON_SECRET ||
    token.length !== expected.length ||
    !timingSafeEqual(token, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isConfigured() || isDemo())
    return Response.json({ error: "Database not configured" }, { status: 503 });
  try {
    const now = new Date().toISOString(),
      state = await transact(undefined, now);
    return Response.json({
      ok: true,
      evaluatedDays: evaluate(state, now).days.length,
    });
  } catch {
    return Response.json({ error: "Settlement failed" }, { status: 500 });
  }
}
