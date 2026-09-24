import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Offer Quest · 开始学习",
    short_name: "开始学习",
    description: "选好目标，开始你的专注学习时间。",
    lang: "zh-CN",
    start_url: "/study",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6fc",
    theme_color: "#f3f6fc",
    icons: [
      { src: "/icons/study-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/study-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [
      { name: "开始学习", url: "/study", description: "打开学习模式" },
      { name: "今日挑战", url: "/", description: "查看今天的任务" },
    ],
  };
}
