"use client";

import { motion } from "framer-motion";

const channels = [
  {
    role: "主",
    name: "豆包",
    desc: "手机号登录写入网页 session；分镜、生图、Seedance 视频都走豆包网页接口。",
  },
  {
    role: "辅",
    name: "即梦",
    desc: "手机号已注册登录获取 session；可在设置中手动切换使用。",
  },
  {
    role: "辅",
    name: "小云雀",
    desc: "手机号已注册登录获取额度；与即梦一样需手动选定账号后使用。",
  },
];

export function LandingChannels() {
  return (
    <section className="border-y border-[var(--line)] bg-white/35 py-16">
      <div className="mx-auto max-w-6xl px-5">
        <p className="mb-2 text-xs tracking-[0.25em] text-teal uppercase">
          Channels
        </p>
        <h2 className="display mb-3 text-3xl font-semibold text-ink">
          豆包为主，即梦 · 小云雀辅助
        </h2>
        <p className="mb-10 max-w-xl text-sm text-muted">
          额度一律手机号 + 验证码登录获取，无需手填
          Key；可存多账号，每次选定一个使用。
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {channels.map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="border-t border-ink/15 pt-4"
            >
              <span
                className={`mb-2 inline-block text-[10px] tracking-wider ${
                  c.role === "主" ? "text-cinnabar" : "text-muted"
                }`}
              >
                {c.role}通道
              </span>
              <h3 className="display text-xl font-semibold">{c.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
