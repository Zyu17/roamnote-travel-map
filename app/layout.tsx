import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "漫游记 · 一起把旅程排进地图",
  description: "为结伴旅行设计的地图化行程规划工具。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
