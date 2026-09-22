import { requireUser, isDemo, errorResponse } from "@/lib/server/supabase";
import { snapshot, transact } from "@/lib/server/repository";
export const dynamic = "force-dynamic";
export async function GET() {
  if (isDemo())
    return Response.json(
      { mode: "demo" },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const user = await requireUser();
    const now = new Date().toISOString();
    return Response.json(snapshot(await transact(undefined, now), user, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
