"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileText, LoaderCircle } from "lucide-react";
import { Modal } from "./ui";

type Saved = { text: string; company: string; link: string; at: string };

/** Opens the job description she saved with an application. The text lives in private storage. */
export function JdButton({
  logId,
  label = "JD",
}: {
  logId: string;
  label?: string;
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
      {open && <JdModal logId={logId} close={() => setOpen(false)} />}
    </>
  );
}

function JdModal({ logId, close }: { logId: string; close: () => void }) {
  const [saved, setSaved] = useState<Saved | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/jd?log=${logId}`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (alive) setSaved(body as Saved);
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "读取失败，请重试");
      }
    })();
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
          {saved.link && (
            <a
              className="jd-link"
              href={saved.link}
              target="_blank"
              rel="noreferrer"
            >
              打开职位链接 <ArrowUpRight size={14} />
            </a>
          )}
          <pre className="jd-text">{saved.text}</pre>
        </>
      )}
    </Modal>
  );
}
