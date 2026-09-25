"use client";
import { Minus } from "lucide-react";
import { desktopBridge } from "@/lib/desktop";
import type { ReactNode } from "react";

export function DesktopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="desktop-widget">
      <header className="desktop-dragbar">
        <span>OFFER QUEST</span>
        <button
          onClick={() => desktopBridge()?.hide()}
          aria-label="收起到菜单栏"
        >
          <Minus size={16} />
        </button>
      </header>
      {children}
    </div>
  );
}
