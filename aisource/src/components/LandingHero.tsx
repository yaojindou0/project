"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function LandingHero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden ink-wash text-paper">
      <div className="absolute inset-0 animate-drift opacity-80">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(42,154,164,0.45),transparent_70%)] blur-2xl" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(200,60,40,0.28),transparent_70%)] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-[40rem] rounded-full bg-[radial-gradient(circle,rgba(196,163,90,0.18),transparent_70%)] blur-2xl" />
      </div>

      {/* Dominant full-bleed visual plane: comic panel composition */}
      <div className="absolute inset-0">
        <svg
          className="h-full w-full opacity-90"
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <linearGradient id="panelFade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1f6f78" stopOpacity="0.35" />
              <stop offset="55%" stopColor="#0c1a1c" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#c83c28" stopOpacity="0.25" />
            </linearGradient>
            <filter id="soft">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>
          </defs>
          <rect width="1600" height="900" fill="url(#panelFade)" />
          <g stroke="rgba(238,244,245,0.2)" strokeWidth="2" fill="none">
            <rect x="80" y="120" width="520" height="360" />
            <rect x="640" y="80" width="380" height="280" />
            <rect x="1060" y="140" width="460" height="420" />
            <rect x="180" y="520" width="700" height="280" />
            <rect x="920" y="600" width="520" height="200" />
          </g>
          <g fill="rgba(238,244,245,0.08)">
            <path d="M120 180 C220 140, 360 200, 420 260 C300 300, 180 280, 120 180Z" />
            <path d="M1100 220 C1240 180, 1400 260, 1450 360 C1320 400, 1180 340, 1100 220Z" />
            <circle cx="780" cy="220" r="48" />
            <path d="M240 620 L820 580 L800 760 L260 740 Z" />
          </g>
          <g
            fill="none"
            stroke="rgba(42,154,164,0.45)"
            strokeWidth="1.5"
            filter="url(#soft)"
          >
            <path d="M100 700 C400 640, 900 760, 1500 680" />
            <path d="M80 300 C500 220, 900 380, 1520 260" />
          </g>
        </svg>
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:justify-center sm:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <p className="brand-mark mb-4 text-5xl text-paper sm:text-7xl md:text-8xl">
            镜叙
          </p>
          <h1 className="display mb-4 max-w-xl text-2xl font-semibold leading-snug text-paper/95 sm:text-3xl md:text-4xl">
            一句话，长成一部竖屏漫剧。
          </h1>
          <p className="mb-8 max-w-lg text-base leading-relaxed text-mist/85 sm:text-lg">
            故事内容生成可编辑分镜词，豆包手机登录后出图出片；即梦 /
            小云雀作辅助回退。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/studio" className="btn-primary">
              开始生成
              <ArrowRight size={16} />
            </Link>
            <Link href="/settings" className="btn-ghost">
              <Sparkles size={16} />
              手机号登录
            </Link>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 1 }}
        className="pointer-events-none absolute bottom-6 left-0 right-0 overflow-hidden border-y border-white/10 bg-black/20 py-3 backdrop-blur-sm"
      >
        <div className="marquee-track flex w-max gap-10 whitespace-nowrap px-4 text-xs tracking-[0.22em] text-mist/70 uppercase">
          {[
            "Script → Storyboard",
            "Image → Motion",
            "Prompt to Reel",
            "竖屏漫剧流水线",
            "角色一致性锚定",
            "图生视频",
            "Script → Storyboard",
            "Image → Motion",
            "Prompt to Reel",
            "竖屏漫剧流水线",
            "角色一致性锚定",
            "图生视频",
          ].map((t, i) => (
            <span key={`${t}-${i}`}>{t}</span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
