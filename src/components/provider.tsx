"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast, Toaster } from "sonner";
import { actionSchema, type Action } from "@/lib/actions";
import type { Snapshot } from "@/lib/types";
import { Flag, LoaderCircle } from "lucide-react";

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type ActionInput = WithoutId<Action>;
type Context = {
  snapshot: Snapshot;
  busy: boolean;
  act: (action: ActionInput) => Promise<boolean>;
  refresh: () => Promise<void>;
  switchRole: () => void;
  logout: () => Promise<void>;
};
const GameContext = createContext<Context | null>(null);
export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("Missing game context");
  return context;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [login, setLogin] = useState(false),
    [refereeKey, setRefereeKey] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401 || response.status === 403) {
        setLogin(true);
        setSnapshot(null);
        setError(response.status === 403 ? data.error : "");
        return;
      }
      if (!response.ok) throw new Error(data.error);
      if (data.mode === "demo") {
        const { demoSnapshot } = await import("@/lib/demo");
        setSnapshot(demoSnapshot());
      } else setSnapshot(data);
      setLogin(false);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "加载失败，请重试");
    }
  }, []);
  useEffect(() => {
    // Microtasks also run in background tabs; a timer can be throttled before the first load.
    queueMicrotask(() => {
      // The referee link carries its key in the fragment, which never reaches the server logs.
      const key = new URLSearchParams(location.hash.slice(1)).get("key");
      if (key) {
        history.replaceState(null, "", location.pathname + location.search);
        setRefereeKey(key);
      }
      void refresh();
    });
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60000);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", onVisibility);
    window.addEventListener("storage", onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("storage", onVisibility);
    };
  }, [refresh]);
  async function act(input: ActionInput) {
    if (busy || !snapshot) return false;
    setBusy(true);
    try {
      const parsed = actionSchema.safeParse({
        ...input,
        id: crypto.randomUUID(),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message || "请检查输入");
      if (snapshot.mode === "demo") {
        const { demoAction } = await import("@/lib/demo");
        setSnapshot(demoAction(parsed.data));
      } else {
        const response = await fetch("/api/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSnapshot(data);
      }
      toast.success(
        input.type === "answer"
          ? "答案已保存，查看下方评审结果"
          : input.type === "settings"
            ? "设置已保存，将于下一训练日生效"
            : input.type === "playerName"
              ? "玩家名字已更新，玩家需要用新名字重新进入"
              : "已保存，继续向前！",
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function switchRole() {
    if (snapshot?.mode !== "demo") return;
    localStorage.setItem(
      "offer-quest-demo-role",
      snapshot.role === "player" ? "referee" : "player",
    );
    void refresh();
  }
  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "logout" }),
    });
    await refresh();
  }
  return (
    <>
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ closeButtonAriaLabel: "关闭提示" }}
      />
      {refereeKey !== null || login ? (
        <Entry
          refereeKey={refereeKey}
          notice={error}
          entered={async () => {
            await refresh();
            setRefereeKey(null);
          }}
        />
      ) : !snapshot ? (
        <div className="loading-page">
          <div className="brand-mark">
            <Flag />
          </div>
          <h1>Offer Quest</h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="button primary" onClick={refresh}>
                重新加载
              </button>
            </>
          ) : (
            <p>
              <LoaderCircle className="spin" /> 正在打开你的训练营…
            </p>
          )}
        </div>
      ) : (
        <GameContext.Provider
          value={{ snapshot, busy, act, refresh, switchRole, logout }}
        >
          {error && (
            <div className="connection-error" role="alert">
              {error} <button onClick={refresh}>重试</button>
            </div>
          )}
          {children}
        </GameContext.Provider>
      )}
    </>
  );
}
function Entry({
  refereeKey,
  notice,
  entered,
}: {
  refereeKey: string | null;
  notice: string;
  entered: () => Promise<void>;
}) {
  const referee = refereeKey !== null;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art">
        <Flag size={48} />
        <h1>
          下一站，
          <br />
          你的 Offer。
        </h1>
        <p>
          一位玩家，一位裁判。
          <br />
          把大目标，变成每天的小胜利。
        </p>
        <div className="login-dots">
          <span>7</span>
          <i />
          <span>14</span>
          <i />
          <span>21</span>
        </div>
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const res = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.get("name"),
                ...(referee && { key: refereeKey }),
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            await entered();
          } catch (error) {
            setError(error instanceof Error ? error.message : "进入失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">
          Offer Quest<span>上岸闯关</span>
        </div>
        <h2>{referee ? "裁判入口" : "欢迎来到训练营"}</h2>
        {notice && !referee && (
          <p className="form-error" role="alert">
            {notice}
          </p>
        )}
        <p className="muted">
          {referee
            ? "输入你的名字，进入裁判工作台。"
            : "输入你的名字就能开始。换设备时，输入同一个名字即可。"}
        </p>
        <label>
          你的名字
          <input
            name="name"
            autoComplete="nickname"
            maxLength={40}
            defaultValue={referee ? "裁判" : undefined}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? "正在进入…" : referee ? "进入裁判工作台" : "进入训练营"}
        </button>
      </form>
    </main>
  );
}
