"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "./ui";

export function MacDownloadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="study-install-button" onClick={() => setOpen(true)}>
        <Download size={16} />
        Mac 桌面按钮
      </button>
      {open && (
        <Modal title="把学习按钮放在 Mac 桌面上" close={() => setOpen(false)}>
          <div className="study-install-help">
            <p>一个常驻的小按钮。点击后直接开始学习，变成倒计时和教练小窗。</p>
            <ol>
              <li>下载安装包，把「开始学习」拖进「应用程序」。</li>
              <li>打开应用，输入学员名字，首次阅读说明并授权摄像头。</li>
              <li>
                以后直接点桌面上的「开始学习」。目标、时长会记住，记录自动同步。
              </li>
            </ol>
            <a
              className="button primary"
              href="https://github.com/huang-0505/assignmenthelper/releases/download/desktop-v0.2.0/Offer-Quest-Mac.dmg"
            >
              下载 Mac 安装包
            </a>
            <p className="muted small">
              适用于 macOS 12 及以上，支持 Apple 芯片和 Intel。此版本尚未经过
              Apple 公证，首次打开可能被系统拦截。学习时需要联网。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
