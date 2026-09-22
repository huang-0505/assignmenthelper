import {
  requireUser,
  isDemo,
  errorResponse,
  member,
} from "@/lib/server/supabase";
import { snapshot, transact } from "@/lib/server/repository";
import { loadOutcomes } from "@/lib/server/study";
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
    const state = await transact(undefined, now);
    const study = await loadOutcomes(now);
    return Response.json(snapshot(state, member(state, user), now, study), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
