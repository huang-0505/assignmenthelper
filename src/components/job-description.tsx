"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileText, LoaderCircle, Pencil } from "lucide-react";
import { useGame } from "./provider";
import { Modal } from "./ui";

type Saved = { text: string; company: string; link: string; at: string };

async function loadJd(logId: string): Promise<Saved> {
  const res = await fetch(`/api/jd?log=${logId}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body as Saved;
}

/** Opens the job description she saved with an application. The text lives in private storage. */
export function JdButton({
  logId,
  label = "JD",
  onEdit,
}: {
  logId: string;
  label?: string;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="small-button jd-button"
        onClick={() => setOpen(true)}
      >
        <FileText size={14} /> {label}
      </button>
      {open && (
        <JdModal
          logId={logId}
          close={() => setOpen(false)}
          onEdit={
            onEdit &&
            (() => {
              setOpen(false);
              onEdit();
            })
          }
        />
      )}
    </>
  );
}

function JdModal({
  logId,
  close,
  onEdit,
}: {
  logId: string;
  close: () => void;
  onEdit?: () => void;
}) {
  const [saved, setSaved] = useState<Saved | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void loadJd(logId)
      .then((body) => alive && setSaved(body))
      .catch(
        (e) =>
          alive &&
          setError(e instanceof Error ? e.message : "读取失败，请重试"),
      );
    return () => {
      alive = false;
    };
  }, [logId]);
  return (
    <Modal
      title={saved?.company || "职位描述"}
      close={close}
      className="jd-modal"
    >
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : !saved ? (
        <p className="muted">
          <LoaderCircle className="spin" size={16} /> 正在打开…
        </p>
      ) : (
        <>
          <div className="jd-tools">
            {saved.link && (
              <a href={saved.link} target="_blank" rel="noreferrer">
                打开职位链接 <ArrowUpRight size={14} />
              </a>
            )}
            {onEdit && (
              <button className="small-button" onClick={onEdit}>
                <Pencil size={14} /> 编辑
              </button>
            )}
          </div>
          <pre className="jd-text">{saved.text}</pre>
        </>
      )}
    </Modal>
  );
}

/** Pastes a description onto an application that has none, or replaces the one it has. */
export function JdEditor({
  logId,
  date,
  company,
  hasJd,
  close,
}: {
  logId: string;
  date: string;
  company: string;
  hasJd: boolean;
  close: () => void;
}) {
  const { act, busy } = useGame();
  const [text, setText] = useState(""),
    [loading, setLoading] = useState(hasJd);
  useEffect(() => {
    if (!hasJd) return;
    let alive = true;
    void loadJd(logId)
      .then((body) => alive && setText(body.text))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [logId, hasJd]);
  const save = async (value: string) => {
    if (await act({ type: "jd", date, logId, text: value })) close();
  };
  return (
    <Modal
      title={`${hasJd ? "编辑" : "保存"} JD${company ? ` · ${company}` : ""}`}
      close={close}
      className="jd-modal"
    >
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(text.trim());
        }}
      >
        <label>
          职位描述（JD）
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            maxLength={12000}
            disabled={loading}
            placeholder={
              loading
                ? "正在读取已保存的 JD…"
                : "把 JD 粘贴进来。面试前可以再看一遍，也方便裁判帮你准备。"
            }
            autoFocus
          />
        </label>
        <div className="jd-tools">
          <button className="button primary" disabled={busy || loading}>
            保存 JD
          </button>
          {hasJd && (
            <button
              type="button"
              className="text-button danger"
              disabled={busy || loading}
              onClick={() => void save("")}
            >
              删除这份 JD
            </button>
          )}
          <span className="muted small">{text.length} / 12000</span>
        </div>
      </form>
    </Modal>
  );
}
