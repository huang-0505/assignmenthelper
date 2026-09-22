import "server-only";
import { adminClient } from "./supabase";
import { advance, evaluate, newGame } from "../engine";
import { bank } from "./bank";
import type { StudyOutcome } from "../study";
import type { GameState, Role, Snapshot } from "../types";

export async function transact(
  change: (state: GameState) => void = () => {},
  now = new Date().toISOString(),
): Promise<GameState> {
  const db = adminClient();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await db
      .from("game_state")
      .select("revision,state")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error("无法读取数据库，请检查迁移是否完成");
    const state = (data?.state ?? newGame(now, bank)) as GameState;
    const original = JSON.stringify(state);
    advance(state, now, bank);
    change(state);
    if (data && JSON.stringify(state) === original) return state;
    const { data: committed, error: commitError } = await db.rpc(
      "commit_game",
      { expected_revision: data?.revision ?? -1, next_state: state },
    );
    if (commitError) throw new Error("保存失败，请检查数据库配置");
    if (committed) return state;
  }
  throw new Error("同时操作较多，请重试；本次修改未保存");
}
export function snapshot(
  state: GameState,
  user: { role: Role; name: string },
  now: string,
  study: StudyOutcome[] = [],
): Snapshot {
  return {
    mode: "live",
    ...user,
    state,
    summary: evaluate(state, now, study),
    today: Object.keys(state.days).sort().at(-1)!,
    serverTime: now,
  };
}
