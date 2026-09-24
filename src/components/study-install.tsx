"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallContext = {
  installed: boolean;
  available: boolean;
  busy: boolean;
  install: () => Promise<boolean>;
};
const Context = createContext<InstallContext | null>(null);

// Listen before authentication/data loading completes, and retain the prompt across routes.
export function StudyInstallProvider({ children }: { children: ReactNode }) {
  const prompt = useRef<InstallPrompt | null>(null);
  const pending = useRef(false);
  const [installed, setInstalled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setInstalled(
        media.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    const ready = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      setAvailable(true);
    };
    const done = () => {
      prompt.current = null;
      setAvailable(false);
      setInstalled(true);
    };
    queueMicrotask(sync);
    media.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  async function install() {
    if (pending.current) return true;
    const event = prompt.current;
    if (!event) return false;
    pending.current = true;
    setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        toast.success("已添加「开始学习」，下次从应用图标打开即可");
      }
      return true;
    } catch {
      return false;
    } finally {
      // A browser install prompt may only be used once, even after dismissal.
      prompt.current = null;
      setAvailable(false);
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Context.Provider value={{ installed, available, busy, install }}>
      {children}
    </Context.Provider>
  );
}

export function StudyInstallButton() {
  const context = useContext(Context);
  const [help, setHelp] = useState(false);
  if (!context || context.installed) return null;

  async function add() {
    if (!(await context!.install())) setHelp(true);
  }

  return (
    <>
      <button
        className="study-install-button"
        onClick={() => void add()}
        disabled={context.busy}
        aria-busy={context.busy}
      >
        {context.busy ? (
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )}
        {context.busy ? "正在添加…" : "添加到桌面"}
      </button>
      {help && (
        <Modal title="把「开始学习」放到桌面" close={() => setHelp(false)}>
          <div className="study-install-help">
            <p>添加一次，下次点击图标就能直接打开学习模式。</p>
            <Link
              href="/study"
              className="button primary"
              onClick={() => setHelp(false)}
            >
              先打开学习页
            </Link>
            {context.available && (
              <button
                className="button secondary"
                onClick={() => void add()}
                disabled={context.busy}
              >
                安装「开始学习」
              </button>
            )}
            <p className="muted">在学习页里，按你使用的浏览器添加：</p>
            <dl>
              <dt>Chrome / Edge · 电脑</dt>
              <dd>
                点击地址栏的安装图标；也可以在浏览器菜单中查找「安装」或「将此页面安装为应用」。安装后可固定到任务栏或
                Dock。
              </dd>
              <dt>Safari · Mac</dt>
              <dd>选择「文件 → 添加到程序坞」，名称填「开始学习」。</dd>
              <dt>手机 / 平板</dt>
              <dd>
                iPhone / iPad 在 Safari 的分享菜单选择「添加到主屏幕」；Android
                在 Chrome 菜单选择「安装应用」或「添加到主屏幕」。
              </dd>
              <dt>没有安装选项？</dt>
              <dd>
                可以给学习页添加书签，或复制学习页地址创建桌面快捷方式。也可以用
                Chrome / Edge 打开后安装。
              </dd>
            </dl>
            <p className="muted small">
              添加需要你在浏览器中确认。学习时需要联网；首次打开可能需要重新输入名字。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
