import "server-only";

import type { ApiSettings } from "./types";
import {
  doubaoWebChatText,
  doubaoWebGenerateImage,
  extractJsonObject,
} from "./doubao-web-chat";
import {
  hasDoubaoWebSession,
  resolveDoubaoWebSession,
} from "./doubao-session";
import { putTmpMedia } from "./tmp-media";

export const DOUBAO_CHAT_MODEL_DEFAULT = "doubao-web";
/** 官方 Seedream 4.5 模型 ID（方舟 / 网页生图统一默认） */
export const DOUBAO_IMAGE_MODEL_DEFAULT = "doubao-seedream-4-5-251128";
export const SEEDREAM_45_MODEL = "doubao-seedream-4-5-251128";

export { hasDoubaoWebSession, resolveDoubaoWebSession } from "./doubao-session";

/** 豆包能力是否可用：网页 session 或方舟 Key */
export function hasDoubaoAuth(settings: ApiSettings) {
  return (
    hasDoubaoWebSession(settings) || Boolean(settings.doubaoApiKey?.trim())
  );
}

/** @deprecated 同 hasDoubaoAuth */
export function hasDoubaoScriptAuth(settings: ApiSettings) {
  return hasDoubaoAuth(settings);
}

export function resolveLlmAuth(settings: ApiSettings): {
  provider: "doubao-web" | "none";
  sessionId?: string;
} {
  const sessionId = resolveDoubaoWebSession(settings);
  if (sessionId) return { provider: "doubao-web", sessionId };
  return { provider: "none" };
}

export async function callChatJson<T>(
  settings: ApiSettings,
  system: string,
  user: string,
): Promise<{ data: T; provider: string }> {
  const sessionId = resolveDoubaoWebSession(settings);
  if (!sessionId) {
    throw new Error("分镜需要豆包手机号登录（网页 session）；可先开演示模式");
  }

  const { text: raw } = await doubaoWebChatText({ sessionId, system, user });
  try {
    return { data: extractJsonObject<T>(raw), provider: "doubao-web" };
  } catch {
    // 自动再要一版：只修 JSON，不重新创作剧情
    const { text: fixed } = await doubaoWebChatText({
      sessionId,
      system:
        "你是 JSON 修复器。用户会给你一段损坏的分镜 JSON 文本。只输出一个可被 JSON.parse 的对象，不要 markdown，不要解释。字段值内禁止英文双引号，改用「」。必须包含 title、characters、shots。",
      user: `请修复为合法 JSON：\n${raw.slice(0, 12000)}`,
    });
    return { data: extractJsonObject<T>(fixed), provider: "doubao-web" };
  }
}

function resolveImageModel(settings: ApiSettings) {
  const m = (settings.doubaoImageModel || settings.imageModel || "").trim();
  if (!m || m === "doubao-web-image" || m.includes("seed-vision")) {
    return SEEDREAM_45_MODEL;
  }
  // 旧 4.0 默认升级到 4.5
  if (m.includes("seedream-4-0") || m.includes("seedream-4.0")) {
    return SEEDREAM_45_MODEL;
  }
  return m;
}

function arkImageSize(aspectRatio?: string, size?: string) {
  if (size && /^\d+x\d+$/i.test(size)) return size;
  if (aspectRatio === "16:9") return "2848x1600";
  if (aspectRatio === "9:16") return "1600x2848";
  if (aspectRatio === "4:3") return "2304x1728";
  if (aspectRatio === "3:4") return "1728x2304";
  return "2048x2048";
}

/** 方舟 Seedream 4.5：/images/generations */
async function generateArkSeedreamImage(input: {
  settings: ApiSettings;
  prompt: string;
  size?: string;
  aspectRatio?: string;
}): Promise<{ imageUrl: string; model: string }> {
  const apiKey = input.settings.doubaoApiKey?.trim();
  if (!apiKey) throw new Error("缺少方舟 API Key");

  const base = (
    input.settings.doubaoApiBase ||
    "https://ark.cn-beijing.volces.com/api/v3"
  ).replace(/\/$/, "");
  const model = resolveImageModel(input.settings);
  const size = arkImageSize(input.aspectRatio, input.size);

  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      size,
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json: {
    error?: { message?: string };
    data?: { url?: string; b64_json?: string }[];
  } = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`方舟生图响应异常: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(
      json.error?.message || `方舟 Seedream 生图失败 HTTP ${res.status}`,
    );
  }
  const url = json.data?.[0]?.url;
  if (url) return { imageUrl: url, model: `ark:${model}` };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) {
    const imageUrl = await putTmpMedia(
      Buffer.from(b64, "base64"),
      "image/png",
      "png",
    );
    return {
      imageUrl,
      model: `ark:${model}`,
    };
  }
  throw new Error("方舟 Seedream 4.5 未返回图片");
}

/**
 * 文生图：优先 Seedream 4.5
 * - 有方舟 Key → Ark /images/generations
 * - 否则 → 豆包网页 skill + Seedream 4.5 模型字段
 */
export async function generateDoubaoImage(input: {
  settings: ApiSettings;
  prompt: string;
  size?: string;
  aspectRatio?: string;
}): Promise<{ imageUrl: string; model: string }> {
  const model = resolveImageModel(input.settings);

  if (input.settings.doubaoApiKey?.trim()) {
    return generateArkSeedreamImage({
      ...input,
      // 确保 settings 内模型已是 4.5
      settings: { ...input.settings, doubaoImageModel: model },
    });
  }

  const sessionId = resolveDoubaoWebSession(input.settings);
  if (!sessionId) {
    throw new Error(
      "生图需要豆包手机号登录（网页 session），或配置方舟 API Key 调用 Seedream 4.5",
    );
  }

  let ratio = input.aspectRatio;
  if (!ratio && input.size) {
    if (input.size.includes("2560x1440") || input.size.startsWith("16"))
      ratio = "16:9";
    else if (input.size.includes("2048") || input.size.startsWith("1"))
      ratio = "1:1";
    else ratio = "9:16";
  }

  return doubaoWebGenerateImage({
    sessionId,
    prompt: input.prompt,
    ratio: ratio || "9:16",
    model,
  });
}

export function shouldUseMockContent(settings: ApiSettings) {
  if (settings.useMock) return true;
  return !hasDoubaoAuth(settings);
}
