import type { DramaProject } from "./types";

export type AspectRatio = DramaProject["aspectRatio"];

/** Tailwind aspect class matching 画幅 */
export function aspectClass(ratio?: string) {
  if (ratio === "16:9") return "aspect-video";
  if (ratio === "1:1") return "aspect-square";
  return "aspect-[9/16]";
}

/** 提示词里的画幅描述 */
export function aspectPromptHint(ratio?: string) {
  if (ratio === "16:9") return "横屏 16:9 构图";
  if (ratio === "1:1") return "正方形 1:1 构图";
  return "竖屏 9:16 构图";
}

export function aspectEnHint(ratio?: string) {
  if (ratio === "16:9") return "16:9 widescreen";
  if (ratio === "1:1") return "1:1 square";
  return "9:16 vertical";
}
