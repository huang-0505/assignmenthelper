import { z } from "zod";
import { STUDY_GOALS } from "./study";

export const STUDY_SETUP_KEY = "offer-quest-study-setup";
const setupSchema = z
  .object({
    goals: z.array(z.enum(STUDY_GOALS)).max(STUDY_GOALS.length),
    goal: z.string().max(80),
    minutes: z.union([z.literal(20), z.literal(30), z.literal(45)]),
  })
  .refine(
    ({ goals, goal }) =>
      [...goals, goal.trim()].filter(Boolean).join("；").length <= 80,
  );

export function parseStudySetup(raw: string | null) {
  try {
    const result = setupSchema.safeParse(JSON.parse(raw ?? "null"));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
