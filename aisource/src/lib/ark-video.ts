import "server-only";

import type { ApiSettings, SeedanceVariant } from "./types";
import { putTmpMedia } from "./tmp-media";

const DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/v3";

const MODEL_BY_VARIANT: Record<SeedanceVariant, string> = {
  mini: "doubao-seedance-2-0-mini-260615",
  fast: "doubao-seedance-2-0-fast-260128",
};

function arkBase(settings: Pick<ApiSettings, "doubaoApiBase">) {
  return (settings.doubaoApiBase || DEFAULT_BASE).replace(/\/$/, "");
}

function extractTaskId(data: Record<string, unknown>): string | null {
  const id =
    (data.id as string) ||
    (data.task_id as string) ||
    ((data.data as Record<string, unknown> | undefined)?.id as string) ||
    ((data.data as Record<string, unknown> | undefined)?.task_id as string);
  return id || null;
}

function extractStatus(data: Record<string, unknown>): string {
  const s =
    (data.status as string) ||
    ((data.data as Record<string, unknown> | undefined)?.status as string) ||
    "";
  return String(s).toLowerCase();
}

function extractVideoUrl(node: unknown, depth = 0): string | null {
  if (depth > 10 || node == null) return null;
  if (typeof node === "string") {
    if (/^https?:\/\//i.test(node) && /(\.mp4|video|bytev|vod)/i.test(node)) {
      return node;
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const x of node) {
      const u = extractVideoUrl(x, depth + 1);
      if (u) return u;
    }
    return null;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of ["video_url", "url", "content_url", "output"]) {
      const v = obj[key];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
    }
    for (const v of Object.values(obj)) {
      const u = extractVideoUrl(v, depth + 1);
      if (u) return u;
    }
  }
  return null;
}

async function materializeRemoteMp4(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
    redirect: "follow",
  });
  if (!res.ok) return url;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) return url;
  return putTmpMedia(buf, "video/mp4", "mp4");
}

/**
 * 火山方舟 Seedance 官方异步视频（网页技能不可用时的可靠回退）
 */
export async function generateArkSeedanceVideo(input: {
  settings: ApiSettings;
  prompt: string;
  duration: number;
  aspectRatio: string;
  variant?: SeedanceVariant;
  /** @deprecated 单图兼容；优先用 refAssets */
  refImageUrl?: string;
  refAssets?: Array<{
    url: string;
    role: "character" | "scene" | "first_frame" | "last_frame";
    label: string;
  }>;
  timeoutMs?: number;
}): Promise<{ videoUrl: string; model: string }> {
  const apiKey = input.settings.doubaoApiKey?.trim();
  if (!apiKey) {
    throw new Error("缺少方舟 API Key（doubaoApiKey）");
  }

  const model =
    (input.variant === "fast"
      ? input.settings.seedanceFastModel
      : input.settings.seedanceMiniModel) ||
    MODEL_BY_VARIANT[input.variant || "mini"];

  // 网页假模型名 → 官方 ID
  const modelId = /seedance-2-0-fast|fast/i.test(model)
    ? MODEL_BY_VARIANT.fast
    : /seedance-2-0-mini|mini/i.test(model)
      ? MODEL_BY_VARIANT.mini
      : /doubao-seedance/i.test(model)
        ? model
        : MODEL_BY_VARIANT[input.variant || "mini"];

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: input.prompt },
  ];

  const assets =
    input.refAssets?.filter((a) => a.url?.trim()) ||
    (input.refImageUrl?.trim()
      ? [
          {
            url: input.refImageUrl.trim(),
            role: "first_frame" as const,
            label: "首帧",
          },
        ]
      : []);

  for (const a of assets.slice(0, 9)) {
    const role =
      a.role === "first_frame"
        ? "first_frame"
        : a.role === "last_frame"
          ? "last_frame"
          : "reference_image";
    content.push({
      type: "image_url",
      image_url: { url: a.url.trim() },
      role,
    });
  }

  const duration = Math.min(Math.max(Math.round(input.duration || 15), 4), 15);
  const payload = {
    model: modelId,
    content,
    ratio: input.aspectRatio || "16:9",
    duration,
    resolution: "720p",
    watermark: false,
  };

  const base = arkBase(input.settings);
  const createRes = await fetch(`${base}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const createText = await createRes.text();
  let createJson: Record<string, unknown>;
  try {
    createJson = JSON.parse(createText) as Record<string, unknown>;
  } catch {
    throw new Error(`方舟建任务失败: ${createText.slice(0, 200)}`);
  }
  if (!createRes.ok) {
    const msg =
      (createJson.error as { message?: string } | undefined)?.message ||
      (createJson.message as string) ||
      createText.slice(0, 200);
    throw new Error(`方舟建任务失败: ${msg}`);
  }

  const taskId = extractTaskId(createJson);
  if (!taskId) throw new Error("方舟未返回 task id");

  const timeoutMs = input.timeoutMs ?? 300_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const stRes = await fetch(`${base}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    const stText = await stRes.text();
    let stJson: Record<string, unknown>;
    try {
      stJson = JSON.parse(stText) as Record<string, unknown>;
    } catch {
      continue;
    }
    const status = extractStatus(stJson);
    if (["succeeded", "success", "completed", "done"].includes(status)) {
      const remote = extractVideoUrl(stJson);
      if (!remote) throw new Error("方舟任务成功但无视频地址");
      const local = await materializeRemoteMp4(remote);
      return { videoUrl: local, model: `ark:${modelId}` };
    }
    if (["failed", "error", "cancelled", "canceled", "expired"].includes(status)) {
      const msg =
        (stJson.error as { message?: string } | undefined)?.message ||
        (stJson.message as string) ||
        status;
      throw new Error(`方舟视频失败: ${msg}`);
    }
  }
  throw new Error("方舟视频生成超时");
}

export function hasArkVideoAuth(settings: Pick<ApiSettings, "doubaoApiKey">) {
  return Boolean(settings.doubaoApiKey?.trim());
}
