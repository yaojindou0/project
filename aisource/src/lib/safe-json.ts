/* eslint-disable @typescript-eslint/no-explicit-any */
import { IS_STATIC_HTML } from "./is-static";
import { absolutizeMediaUrl } from "./api-fetch";

/** 安全解析 JSON；对超大/截断响应给出可读错误 */
export function safeParseJson(text: string, label = "数据"): any {
  const raw = (text || "").trim();
  if (!raw) throw new Error(`${label}为空`);
  try {
    return JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "JSON 解析失败";
    if (/Unterminated string|Unexpected end|Unexpected token/i.test(msg)) {
      throw new Error(
        `${label}过大或已截断（勿在接口里传超大 base64）。请重试生成；若反复出现，清除浏览器本站数据后重开。原文：${msg}`,
      );
    }
    throw new Error(`${label}解析失败：${msg}`);
  }
}

function fixMediaFields(data: any): any {
  if (!data || typeof data !== "object") return data;
  if (typeof data.imageUrl === "string") {
    data.imageUrl = absolutizeMediaUrl(data.imageUrl) || data.imageUrl;
  }
  if (typeof data.videoUrl === "string") {
    data.videoUrl = absolutizeMediaUrl(data.videoUrl) || data.videoUrl;
  }
  if (Array.isArray(data.shots)) {
    data.shots = data.shots.map((s: any) => {
      if (!s || typeof s !== "object") return s;
      return {
        ...s,
        sceneImageUrl: absolutizeMediaUrl(s.sceneImageUrl) || s.sceneImageUrl,
        imageUrl: absolutizeMediaUrl(s.imageUrl) || s.imageUrl,
        lastFrameUrl: absolutizeMediaUrl(s.lastFrameUrl) || s.lastFrameUrl,
        videoUrl: absolutizeMediaUrl(s.videoUrl) || s.videoUrl,
      };
    });
  }
  if (Array.isArray(data.characters)) {
    data.characters = data.characters.map((c: any) => {
      if (!c || typeof c !== "object") return c;
      return {
        ...c,
        threeViewUrl: absolutizeMediaUrl(c.threeViewUrl) || c.threeViewUrl,
        referenceImageUrl:
          absolutizeMediaUrl(c.referenceImageUrl) || c.referenceImageUrl,
      };
    });
  }
  return data;
}

export async function readResponseJson(
  res: Response,
  label = "接口响应",
): Promise<any> {
  const text = await res.text();
  const data = safeParseJson(text, label);
  if (IS_STATIC_HTML) return fixMediaFields(data);
  return data;
}
