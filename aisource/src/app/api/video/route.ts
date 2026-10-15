import { NextResponse } from "next/server";
import { shouldUseMock } from "@/lib/ai";
import { shouldUseMockVideo } from "@/lib/jimeng";
import { mockGenerateVideo } from "@/lib/mock";
import { generateVideoWithFallback } from "@/lib/providers";
import { ensureRenderStyle } from "@/lib/render-style";
import { resolveVideoCharacters } from "@/lib/shot-characters";
import { putDataUrlAsTmpMedia } from "@/lib/tmp-media";
import { withGenerateVideoPrefix } from "@/lib/video-prompt";
import type {
  ApiSettings,
  CharacterCard,
  SeedanceVariant,
  Shot,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface VideoBody {
  prompt: string;
  duration?: number;
  index?: number;
  aspectRatio?: string;
  imageUrl?: string;
  lastFrameUrl?: string;
  sceneImageUrl?: string;
  characters?: CharacterCard[];
  /** 当前分镜（用于自动捕捉涉及人物） */
  shot?: Partial<Shot>;
  /** 前端勾选的角色键（id 或 name）；省略则自动识别 */
  selectedCharacterKeys?: string[];
  /** 复用豆包同一对话 */
  conversationId?: string;
  variant?: SeedanceVariant;
  settings: ApiSettings;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VideoBody;

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "请先填写分镜词" }, { status: 400 });
    }

    const allChars = body.characters || [];
    const shotForMatch = {
      id: body.shot?.id || "tmp",
      index: body.index ?? 0,
      scene: body.shot?.scene || "",
      dialogue: body.shot?.dialogue || "",
      lines: body.shot?.lines,
      characterIntros: body.shot?.characterIntros,
      storyboardPrompt:
        body.shot?.storyboardPrompt || body.prompt || "",
      imagePrompt: body.shot?.imagePrompt || "",
      camera: body.shot?.camera || "",
      status: "animating" as const,
    } satisfies Shot;

    // 勾选角色优先；未传则按分镜自动捕捉。仅上传有参考图的角色
    const involved = resolveVideoCharacters(
      shotForMatch,
      allChars,
      body.selectedCharacterKeys,
    );
    const locked = involved.filter(
      (c) => c.locked !== false && (c.threeViewUrl || c.referenceImageUrl),
    );
    const matchedNames = involved.map((c) => c.name);

    const hasScene = Boolean(body.sceneImageUrl);
    const hasFirstFrame = Boolean(body.imageUrl);
    const hasLastFrame = Boolean(body.lastFrameUrl);
    const imageUrls = [
      ...locked.map((c) => c.threeViewUrl || c.referenceImageUrl!),
      ...(hasScene ? [body.sceneImageUrl!] : []),
      ...(hasFirstFrame ? [body.imageUrl!] : []),
      ...(hasLastFrame ? [body.lastFrameUrl!] : []),
    ].slice(0, 9);
    const imageMeta = {
      characterCount: locked.length,
      hasScene,
      hasFirstFrame,
      hasLastFrame,
    };

    if (shouldUseMock(body.settings) && body.settings.useMock) {
      const videoUrl = await mockGenerateVideo(
        body.imageUrl || "",
        body.index ?? 0,
      );
      return NextResponse.json({
        mode: "mock",
        videoUrl,
        model:
          body.variant === "fast"
            ? "seedance-2.0-fast(mock)"
            : "seedance-2.0-mini(mock)",
        accounts: body.settings.jimengAccounts,
        matchedCharacters: matchedNames,
      });
    }

    if (shouldUseMockVideo(body.settings)) {
      const videoUrl = await mockGenerateVideo(
        body.imageUrl || "",
        body.index ?? 0,
      );
      return NextResponse.json({
        mode: "mock",
        videoUrl,
        model:
          body.variant === "fast"
            ? "seedance-2.0-fast(mock)"
            : "seedance-2.0-mini(mock)",
        accounts: body.settings.jimengAccounts,
        hint: "未登录豆包 / 即梦 / 小云雀，已回退演示",
        matchedCharacters: matchedNames,
      });
    }

    try {
      const duration = Math.min(
        15,
        Math.max(4, Math.round(body.duration ?? 15)),
      );
      const prompt = withGenerateVideoPrefix(
        ensureRenderStyle(body.prompt),
        body.aspectRatio || "16:9",
        duration,
      );
      const result = await generateVideoWithFallback({
        settings: body.settings,
        prompt,
        duration,
        aspectRatio: body.aspectRatio || "16:9",
        variant: body.variant,
        imageUrls,
        imageMeta,
        lockedCharacters: locked,
        conversationId: body.conversationId,
      });

      let videoUrl = result.videoUrl;
      if (videoUrl?.startsWith("data:")) {
        videoUrl = await putDataUrlAsTmpMedia(videoUrl);
      }

      return NextResponse.json({
        mode: result.mode,
        videoUrl,
        model: result.model,
        accountLabel: result.accountLabel,
        accounts: result.accounts,
        tried: result.tried,
        chatText: result.chatText,
        conversationId:
          result.conversationId || body.conversationId || undefined,
        matchedCharacters: matchedNames,
        ...(videoUrl
          ? {}
          : {
              error: result.chatText
                ? "未生成视频；若需确认已自动发送「确定」。可在下方面板继续回复同一对话窗"
                : "未生成视频",
            }),
      });
    } catch (e) {
      if (e instanceof Error && e.message === "MOCK_REQUIRED") {
        const videoUrl = await mockGenerateVideo(
          body.imageUrl || "",
          body.index ?? 0,
        );
        return NextResponse.json({
          mode: "mock",
          videoUrl,
          model: "seedance-mock",
          accounts: body.settings.jimengAccounts,
          matchedCharacters: matchedNames,
        });
      }
      throw e;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频生成失败";
    const accounts =
      error &&
      typeof error === "object" &&
      "accounts" in error &&
      Array.isArray((error as { accounts?: unknown }).accounts)
        ? (error as { accounts: unknown[] }).accounts
        : undefined;
    return NextResponse.json(
      { error: message, ...(accounts ? { accounts } : {}) },
      { status: 500 },
    );
  }
}
