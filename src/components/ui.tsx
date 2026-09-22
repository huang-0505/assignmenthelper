"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, Check, Snowflake, Clock3, Minus } from "lucide-react";
import type { DayStatus } from "@/lib/types";
export const statusLabel: Record<DayStatus, string> = {
  open: "进行中",
  met: "已达标",
  gold: "超额完成",
  missed: "未达标",
  frozen: "冻结保护",
  pending: "待裁判审核",
  waiting: "等待前日审核",
};
export function Status({ status }: { status: DayStatus }) {
  return (
    <span className={`status ${status}`}>
      {status === "met" || status === "gold" ? (
        <Check size={13} />
      ) : status === "frozen" ? (
        <Snowflake size={13} />
      ) : status === "pending" || status === "waiting" ? (
        <Clock3 size={13} />
      ) : (
        <Minus size={13} />
      )}
      {statusLabel[status]}
    </span>
  );
}
export function Progress({
  value,
  label,
  tone = "",
}: {
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <div
      className={`progress ${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.min(100, Math.round(value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        style={{
          transform: `scaleX(${Math.min(1, Math.max(0, value / 100))})`,
        }}
      />
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={`modal ${className}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-top">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="关闭窗口" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionHeading({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {children}
    </div>
  );
}
