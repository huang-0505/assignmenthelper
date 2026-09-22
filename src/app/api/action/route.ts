import { applyAction, applyGrade, actionSchema } from "@/lib/actions";
import { gradeAnswer, DEFAULT_MODELS } from "@/lib/grading";
import { bank } from "@/lib/server/bank";
import {
  requireUser,
  verifyOrigin,
  errorResponse,
  HttpError,
  isDemo,
} from "@/lib/server/supabase";
import { snapshot, transact } from "@/lib/server/repository";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (isDemo()) throw new HttpError("演示模式只在当前浏览器保存记录", 503);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 50000) throw new HttpError("提交内容太长", 413);
    const parsed = actionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new HttpError(
        parsed.error.issues[0]?.message || "请检查输入内容",
        400,
      );
    const action = parsed.data,
      now = new Date().toISOString();
    let freshAnswer = false;
    let state = await transact((s) => {
      freshAnswer = !s.audit.some((a) => a.id === action.id);
      applyAction(s, action, user.role, user.id, now, bank);
    }, now);
    if (action.type === "answer" && freshAnswer) {
      const grade = await gradeAnswer(
        state.days[action.date].question!,
        action.text,
        {
          baseUrl: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
          apiKey: process.env.LLM_API_KEY,
          models: (process.env.LLM_MODELS || DEFAULT_MODELS.join(","))
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        },
      );
      state = await transact((s) =>
        applyGrade(s, action.date, action.id, grade),
      );
    }
    const finalNow = new Date().toISOString();
    return Response.json(snapshot(state, user, finalNow));
  } catch (error) {
    return errorResponse(error);
  }
}
