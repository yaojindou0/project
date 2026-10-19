/**
 * 安卓开发代理：与 PC /api/image 相同入参。
 * 有方舟 Key → config.js image（ark）；否则用豆包网页 session 走 Seedream skill。
 */

import {
  doubaoWebGenerateImage,
  resolveImageAuth,
} from "./image-web.mjs";

function ensureStyle(prompt, kind) {
  const p = String(prompt || "").trim();
  if (!p) return p;
  if (kind === "scene") {
    if (/empty|无人|no people/i.test(p)) return p;
    return `${p}, empty environment, no people, cinematic lighting`;
  }
  if (/CG|国漫|anime|cinematic/i.test(p)) return p;
  return `${p}, CG guoman cinematic style`;
}

function sizeForRatio(ratio) {
  if (ratio === "16:9") return "2560x1440";
  if (ratio === "1:1") return "2048x2048";
  return "1440x2560";
}

async function runArkImage(body, imageUrl, arkKey, prompt) {
  const size = sizeForRatio(body.aspectRatio || "16:9");
  const target = new URL(imageUrl);
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${arkKey}`,
    },
    body: JSON.stringify({
      model: "doubao-seedream-4-0-250828",
      prompt,
      size,
      response_format: "url",
      watermark: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(
      data?.error?.message || `方舟生图失败: ${res.status} ${text.slice(0, 160)}`,
    );
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  const url =
    data?.data?.[0]?.url ||
    data?.data?.[0]?.b64_json ||
    data?.image_url ||
    "";
  if (!url) {
    const err = new Error("方舟未返回图片地址");
    err.status = 502;
    throw err;
  }
  const imageOut = String(url).startsWith("http")
    ? url
    : `data:image/png;base64,${url}`;
  return {
    mode: "doubao",
    provider: "doubao-ark",
    imageUrl: imageOut,
  };
}

export async function runImageUpstream(body, imageUrl) {
  if (body?.imageUrl) {
    return { mode: "upload", imageUrl: body.imageUrl };
  }
  const prompt = ensureStyle(body?.prompt, body?.kind);
  if (!prompt) {
    const err = new Error("缺少生图提示词");
    err.status = 400;
    throw err;
  }

  const { arkKey, sessionId, cookieHeader } = resolveImageAuth(body.settings);

  if (arkKey && imageUrl) {
    return runArkImage(body, imageUrl, arkKey, prompt);
  }

  if (!sessionId) {
    const err = new Error(
      "生图需要豆包网页 session（设置里登录/粘贴），或填写方舟 API Key",
    );
    err.status = 400;
    throw err;
  }

  const result = await doubaoWebGenerateImage({
    sessionId,
    cookieHeader,
    prompt,
    ratio: body.aspectRatio || "16:9",
  });
  return {
    mode: "doubao",
    provider: "doubao-web",
    model: result.model,
    imageUrl: result.imageUrl,
  };
}
