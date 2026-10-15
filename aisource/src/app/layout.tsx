import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Noto_Sans_SC,
  ZCOOL_XiaoWei,
} from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const brand = ZCOOL_XiaoWei({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "镜叙 JINGXU · AI 漫剧生成",
  description: "通过提示词与图片生成竖屏漫剧视频：分镜、首帧、图生视频一站完成。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${display.variable} ${sans.variable} ${brand.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="film-grain" aria-hidden />
        <SiteNav />
        <main className="relative z-10 flex-1">{children}</main>
      </body>
    </html>
  );
}
