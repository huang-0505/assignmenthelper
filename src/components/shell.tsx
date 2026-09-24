"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  CalendarDays,
  ChartNoAxesCombined,
  Flag,
  Flame,
  FolderOpen,
  Gift,
  LogOut,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Timer,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useGame } from "./provider";
import { Modal } from "./ui";
const study = { href: "/study", label: "学习模式", icon: Timer },
  applications = { href: "/applications", label: "投递记录", icon: Briefcase },
  history = { href: "/history", label: "打卡日历", icon: CalendarDays },
  stats = { href: "/stats", label: "成长记录", icon: ChartNoAxesCombined },
  projects = { href: "/projects", label: "我的项目", icon: FolderOpen };
const nav = [
  { href: "/", label: "今日挑战", icon: Sun },
  study,
  applications,
  history,
  stats,
  // The phone bar shows the first five; the project archive matters least there.
  projects,
];
export function Shell({ children }: { children: ReactNode }) {
  const { snapshot, switchRole, logout } = useGame(),
    path = usePathname();
  const [celebration, setCelebration] = useState<
    (typeof snapshot.summary.rewards)[number] | null
  >(null);
  useEffect(() => {
    if (snapshot.role !== "player") return;
    const reward = snapshot.summary.rewards.find(
      (r) => !localStorage.getItem(`offer-quest-seen-${snapshot.mode}-${r.id}`),
    );
    if (reward) {
      const timer = setTimeout(() => setCelebration(reward), 450);
      return () => clearTimeout(timer);
    }
  }, [snapshot.summary.rewards, snapshot.role, snapshot.mode]);
  const closeReward = () => {
    if (celebration)
      localStorage.setItem(
        `offer-quest-seen-${snapshot.mode}-${celebration.id}`,
        "true",
      );
    setCelebration(null);
  };
  const links =
    snapshot.role === "referee"
      ? [
          { href: "/referee", label: "裁判工作台", icon: ShieldCheck },
          study,
          applications,
          history,
          stats,
          { href: "/settings", label: "挑战设置", icon: Settings2 },
          projects,
        ]
      : nav;
  // Day one of the camp reads better as "day 1" than as a streak of zero.
  const campDay =
    Object.keys(snapshot.state.days).sort().indexOf(snapshot.today) + 1;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Link
          href={snapshot.role === "referee" ? "/referee" : "/"}
          className="brand-lockup"
        >
          <span className="brand-mark">
            <Flag size={24} fill="currentColor" />
          </span>
          <span className="brand">
            Offer Quest<span>上岸闯关</span>
          </span>
        </Link>
        <div className="season-label">
          <span className="live-dot" /> 数据科学家养成计划
        </div>
        <nav aria-label="主导航">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${path === href ? "active" : ""}`}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {path === href && <i />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Target size={24} />
          <p>
            不用一天变厉害。
            <br />
            每天厉害一点就好。
          </p>
          <span>积累你的下一种可能</span>
        </div>
        <div className="profile">
          <span className="avatar">
            {snapshot.role === "player" ? "P" : "R"}
          </span>
          <div>
            <strong>{snapshot.name}</strong>
            <span>
              {snapshot.role === "player" ? "玩家" : "裁判"} · 专属训练营
            </span>
          </div>
          {snapshot.mode === "live" && (
            <button
              className="icon-button"
              onClick={logout}
              aria-label="退出训练营"
            >
              <LogOut size={17} />
            </button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            我的训练营 <span>/</span>{" "}
            {links.find((l) => l.href === path)?.label || "今日挑战"}
          </div>
          <div className="topbar-right">
            <span className="timezone">
              <span className="live-dot" />
              纽约时间
            </span>
            <span className="streak-chip">
              <Flame size={16} fill="currentColor" />{" "}
              {snapshot.summary.streak > 0
                ? `${snapshot.summary.streak} 天连胜`
                : `第 ${campDay} 天`}
            </span>
          </div>
        </header>
        {snapshot.mode === "demo" && (
          <div className="demo-bar">
            <span>
              <Sparkles size={14} /> 演示训练营 · 数据保存在当前浏览器
            </span>
            <button onClick={switchRole}>
              切换{snapshot.role === "player" ? "裁判" : "玩家"}视角
            </button>
          </div>
        )}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="page-footer">
          <Flag size={13} /> 每一份努力，都算数。<span>Offer Quest</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="移动导航">
        {links.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            className={path === href ? "active" : ""}
            aria-current={path === href ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {celebration && (
        <Modal
          title="新的里程碑，属于你！"
          close={closeReward}
          className="celebration"
        >
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDelay: `${(i % 6) * 0.13}s`,
                  background: ["#f7d96b", "#ffab87", "#84d6bb", "#365ae8"][
                    i % 4
                  ],
                }}
              />
            ))}
          </div>
          <div className="reward-medal">
            <Gift size={56} />
          </div>
          <p className="muted">连续坚持 {celebration.streak} 天</p>
          <h3>你真的做到了。</h3>
          <p className="reward-text">{celebration.text}</p>
          <p className="muted">这份奖励已解锁，快和裁判一起庆祝。</p>
          <button className="button primary" onClick={closeReward}>
            收下奖励，继续向前
          </button>
        </Modal>
      )}
    </div>
  );
}
