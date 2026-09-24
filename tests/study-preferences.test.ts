import { describe, expect, it } from "vitest";
import { parseStudySetup } from "../src/lib/study-preferences";

describe("remembered study setup", () => {
  it("restores selected goals, extra text, and duration", () => {
    const setup = {
      goals: ["技术学习", "项目练习"],
      goal: "复盘 SQL 项目",
      minutes: 45,
    };
    expect(parseStudySetup(JSON.stringify(setup))).toEqual(setup);
  });
  it.each([
    null,
    "{",
    "null",
    "[]",
    '{"minutes":10}',
    '{"goals":["old"],"goal":"","minutes":30}',
  ])("falls back safely for missing, corrupt, or outdated storage: %s", (raw) =>
    expect(parseStudySetup(raw)).toBeNull(),
  );
  it("rejects remembered text that exceeds the server's combined goal limit", () => {
    expect(
      parseStudySetup(
        JSON.stringify({
          goals: ["技术学习"],
          goal: "a".repeat(80),
          minutes: 20,
        }),
      ),
    ).toBeNull();
  });
  it("preserves a custom-only goal without adding a default chip", () => {
    expect(
      parseStudySetup(JSON.stringify({ goals: [], goal: "复盘", minutes: 20 })),
    ).toEqual({ goals: [], goal: "复盘", minutes: 20 });
  });
});
