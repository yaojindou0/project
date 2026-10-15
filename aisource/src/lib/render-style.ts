/** 人物向生图 / 生视频默认画面约束；画幅由调用方按选项写入 */
export const ALWAYS_ON_RENDER_SUFFIX =
  "【画面默认】CG国漫电影级渲染，干净轮廓线，高细节，统一光影质感；人体结构正常，五官清晰，服装细节完整；禁止换脸、畸形手指、扭曲五官、穿模、画面水印与多余文字。" +
  " Default: CG Chinese comic / guoman cinematic render, clean outlines, high detail, consistent lighting, anatomically correct, no face swap, no deformed hands, no watermark.";

/** 场景空镜专用：无人、国漫电影级环境（比例随画幅选项） */
export const ALWAYS_ON_SCENE_SUFFIX =
  "【场景默认】纯环境建立镜头，CG国漫电影级场景，统一光影与体积感；画面禁止出现任何人物、人脸、人体剪影、路人、肢体。" +
  " Default scene: CG guoman cinematic environment establishing shot only, no people, no characters, no human silhouette.";

/**
 * 强制把默认渲染风格写入提示词（已含标记则不重复）。
 * stylePreset：当前所选风格完整 prompt，可空。
 */
export function ensureRenderStyle(
  prompt: string,
  stylePreset?: string,
): string {
  const parts: string[] = [];
  const main = (prompt || "").trim();
  if (main) parts.push(main);

  const style = (stylePreset || "").trim();
  if (style) {
    const needle = style.slice(0, 36);
    if (!main.includes(needle) && !parts.some((p) => p.includes(needle))) {
      parts.push(style);
    }
  }

  let out = parts.join("\n").trim();
  if (!out.includes("【画面默认】")) {
    out = `${out}\n${ALWAYS_ON_RENDER_SUFFIX}`.trim();
  }
  if (!/CG国漫|国漫电影|guoman/i.test(out)) {
    out = `${out}\nCG国漫电影级渲染，干净轮廓线，高细节。`;
  }
  return out;
}

/** 场景图：不套用人像后缀，改为无人环境约束 */
export function ensureSceneRenderStyle(
  prompt: string,
  stylePreset?: string,
): string {
  const parts: string[] = [];
  const main = (prompt || "").trim();
  if (main) parts.push(main);

  const style = (stylePreset || "")
    .trim()
    .replace(/digital human[^,]*/gi, "cinematic environment")
    .replace(/character turnaround[^,]*/gi, "environment establishing")
    .replace(/CG character[^,]*/gi, "CG environment")
    .replace(/人像|皮肤|毛孔|角色|五官/g, "环境");
  if (style) {
    const needle = style.slice(0, 28);
    if (!main.includes(needle)) parts.push(style);
  }

  let out = parts.join("\n").trim();
  out = out.replace(/【画面默认】[^\n]*/g, "").trim();
  if (!out.includes("【场景默认】")) {
    out = `${out}\n${ALWAYS_ON_SCENE_SUFFIX}`.trim();
  }
  return out;
}
