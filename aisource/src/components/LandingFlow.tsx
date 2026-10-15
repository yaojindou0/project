"use client";

import { motion } from "framer-motion";
import { Film, ImagePlus, PenLine, Workflow } from "lucide-react";

const steps = [
    {
      icon: PenLine,
      title: "写内容",
      desc: "输入故事梗概，豆包登录后自动拆出可编辑分镜词。",
    },
    {
      icon: Workflow,
      title: "锁角色",
      desc: "上传参考图并锁定人物，跨镜保持形象一致。",
    },
    {
      icon: ImagePlus,
      title: "改分镜词",
      desc: "每镜提示词可改，满意后再点生成，避免浪费额度。",
    },
    {
      icon: Film,
      title: "出视频",
      desc: "手机登录额度出片：豆包为主，即梦 / 小云雀辅助回退。",
    },
  ];

export function LandingFlow() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="mb-10 max-w-xl">
        <p className="mb-2 text-xs tracking-[0.25em] text-teal uppercase">
          Pipeline
        </p>
        <h2 className="display text-3xl font-semibold text-ink sm:text-4xl">
          从提示词到可播视频
        </h2>
        <p className="mt-3 text-muted">
          一条流水线串起剧本、分镜、关键帧与图生视频，适合竖屏漫剧快速试片。
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            className="relative border-t border-ink/15 pt-5"
          >
            <step.icon className="mb-4 text-cinnabar" size={22} />
            <p className="mb-1 text-xs tracking-widest text-muted">
              0{i + 1}
            </p>
            <h3 className="display mb-2 text-xl font-semibold">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
