import type { Metadata, Viewport } from "next";
import "@fontsource-variable/nunito-sans";
import "./globals.css";
export const metadata: Metadata = {
  title: "Offer Quest · 上岸闯关",
  description:
    "一个人的坚持，两个人的约定。为 Data Scientist 面试准备的每日挑战训练营。",
  robots: { index: false, follow: false },
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
      <body>{children}</body>
    </html>
  );
}
