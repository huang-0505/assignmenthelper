import type { Metadata, Viewport } from "next";
import "@fontsource-variable/nunito-sans";
import "./globals.css";
import { StudyInstallProvider } from "@/components/study-install";
export const metadata: Metadata = {
  title: "Offer Quest · 上岸闯关",
  description:
    "一个人的坚持，两个人的约定。为 Data Scientist 面试准备的每日挑战训练营。",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "开始学习", statusBarStyle: "default" },
  icons: { apple: "/icons/study-180.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f6fc",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <StudyInstallProvider>{children}</StudyInstallProvider>
      </body>
    </html>
  );
}
