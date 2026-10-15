import { NextResponse } from "next/server";
import { shouldUseMock } from "@/lib/ai";
import { generateDoubaoImage, hasDoubaoAuth } from "@/lib/doubao-content";
import { mockGenerateImage } from "@/lib/mock";
import { ensureRenderStyle, ensureSceneRenderStyle } from "@/lib/render-style";
import { putDataUrlAsTmpMedia } from "@/lib/tmp-media";
import type { ApiSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

interface ImageBody {
  prompt: string;
  index?: number;
  imageUrl?: string;
  settings: ApiSettings;
  aspectRatio?: string;
  /** scene=场景空镜（无人环境）；比例一律跟画幅选项 */
  kind?: "scene" | "character" | "frame";
}

/** 豆包网页限流冷却（本进程内）——限流后直接拒绝，不再自动连发加重风控 */
let doubaoImageCooldownUntil = 0;

function sizeForRatio(ratio?: string) {
  if (ratio === "16:9") return "2560x1440";
  if (ratio === "1:1") return "2048x2048";
  return "1440x2560";
}

function isDoubaoRateLimited(message: string) {
  return /71002200[24]|访问过于频繁|访问频繁/.test(message);
}

/**
 * 生图：仅线上豆包（网页 session / 可选方舟 Key）
 * 本机不需要、也不回退任何本地代理（:5100）
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImageBody;

    if (body.imageUrl) {
      return NextResponse.json({ mode: "upload", imageUrl: body.imageUrl });
    }

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "缺少生图提示词" }, { status: 400 });
    }

    const settings = body.settings;
    const isScene = body.kind === "scene";
    const prompt = isScene
      ? ensureSceneRenderStyle(body.prompt)
      : ensureRenderStyle(body.prompt);
    const aspectRatio = body.aspectRatio || "16:9";

    if (shouldUseMock(settings) || !hasDoubaoAuth(settings)) {
      const imageUrl = await mockGenerateImage(prompt, body.index ?? 0);
      return NextResponse.json({
        mode: "mock",
        provider: "mock",
        imageUrl,
        hint: shouldUseMock(settings)
          ? undefined
          : "未登录豆包，已使用演示生图（请在设置页用手机号登录豆包）",
      });
    }

    const waitMs = doubaoImageCooldownUntil - Date.now();
    if (waitMs > 0) {
      const sec = Math.ceil(waitMs / 1000);
      return NextResponse.json(
        {
          error: `豆包限流冷却中，请约 ${sec} 秒后再试（勿连点，连点会延长封禁）`,
        },
        { status: 429 },
      );
    }

    try {
      const result = await generateDoubaoImage({
        settings,
        prompt,
        size: sizeForRatio(aspectRatio),
        aspectRatio,
      });
      doubaoImageCooldownUntil = 0;
      let imageUrl = result.imageUrl;
      // 兜底：若仍是超大 data URL，落盘为临时链接，避免前端 JSON.parse 炸
      if (imageUrl.startsWith("data:")) {
        imageUrl = await putDataUrlAsTmpMedia(imageUrl);
      }
      return NextResponse.json({
        mode: "doubao",
        provider: settings.doubaoApiKey?.trim()
          ? "doubao-ark"
          : "doubao-web",
        model: result.model,
        imageUrl,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "豆包生图失败";
      const debug = (e as { debug?: unknown })?.debug;

      if (isDoubaoRateLimited(message)) {
        doubaoImageCooldownUntil = Date.now() + 90_000;
        return NextResponse.json(
          {
            error: `${message}（请等待约 2–3 分钟后再点一次）`,
            debug,
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        debug ? { error: message, debug } : { error: message },
        { status: 500 },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    const debug = (error as { debug?: unknown })?.debug;
    return NextResponse.json(
      debug ? { error: message, debug } : { error: message },
      { status: 500 },
    );
  }
}
