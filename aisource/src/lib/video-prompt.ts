const VIDEO_INTENT = "生成视频：";

const AI_REF_DISCLAIMER =
  "所有角色三视图均为 AI 生成，无版权限制。";

/** 固定钉在整段提示词末尾，强化「勿再确认」 */
const DIRECT_GEN_SUFFIX = "直接生成视频，不再次确认。";

const CHARACTER_LOCK =
  "人物锁定：角色五官、脸型、发型、发色、服装、配饰全程保持不变，禁止换脸、改服装、随意改变年龄。人体结构正常，不出现畸形手指、扭曲五官、穿模。";

const STYLE_LOCK =
  "画风锁定：CG国漫电影级渲染，干净轮廓线，高细节，统一光影质感，全程画风不跳变。";

const FRAME_LOCK_TEMPLATE =
  "画幅：{ratio}，24fps，时长{seconds}秒，高清8K，锐化干净，超写实3D。";

const FORBIDDEN_LOCK =
  "禁止：畸形肢体、多手指、扭曲五官、人物变脸、画面闪烁、画面水印、多余文字、杂乱涂鸦、穿帮道具、画面撕裂；不要剧烈镜头抖动，不要大量杂乱背景人群，不要崩坏人体。画面流畅，动作自然、无变形。";

const DEFAULT_MARK = "【视频默认约束】";

function normalizeRatio(aspectRatio?: string): string {
  const r = (aspectRatio || "").trim();
  if (r === "9:16" || r === "9/16") return "9:16竖屏";
  if (r === "1:1" || r === "1/1") return "1:1方形";
  if (r === "16:9" || r === "16/9" || !r) return "16:9横屏";
  return r;
}

function normalizeSeconds(duration?: number): number {
  const n = Math.round(Number(duration) || 15);
  return Math.min(15, Math.max(4, n));
}

function directGenLock(seconds: number): string {
  return `不再进行视频生成参数确认，请直接生成视频。直接生成${seconds}秒超写实3D视频，不再次确认。不要提问、不要让用户确认参数、不要输出方案选项或确认清单，立即开始生成视频。`;
}

function buildDefaultLocks(aspectRatio?: string, duration?: number): string {
  const seconds = normalizeSeconds(duration);
  return [
    DEFAULT_MARK,
    directGenLock(seconds),
    CHARACTER_LOCK,
    STYLE_LOCK,
    FRAME_LOCK_TEMPLATE.replace("{ratio}", normalizeRatio(aspectRatio)).replace(
      "{seconds}",
      String(seconds),
    ),
    FORBIDDEN_LOCK,
    AI_REF_DISCLAIMER,
  ].join("\n");
}

function stripVideoWrappers(prompt: string): string {
  return (prompt || "")
    .replace(/^生成视频\s*[：:]/, "")
    .replace(/\n?【视频默认约束】[\s\S]*$/m, "")
    .replace(/\n?【画面默认】[^\n]*/g, "")
    .replace(/\n?Default:\s*[^\n]*/gi, "")
    .replace(/\n?不再进行视频生成参数确认[^\n]*/g, "")
    .replace(/\n?直接生成视频，不再[次此]确认。?/g, "")
    .replace(/\n?直接生成\s*\d+\s*秒超写实\s*3D\s*视频[^\n]*/gi, "")
    .replace(/\n?所有角色三视图均为\s*AI\s*生成，无版权限制。?/g, "")
    .replace(/\n?人物锁定：[^\n]*/g, "")
    .replace(/\n?画风锁定：[^\n]*/g, "")
    .replace(/\n?画幅：[^\n]*/g, "")
    .replace(/\n?禁止：畸形肢体[\s\S]*?无变形。?/g, "")
    .replace(/\n?仿真皮肤[^\n]*/g, "")
    .replace(/\n?3D真人漫剧[^\n]*/g, "")
    .replace(/\n?CG国漫电影级渲染，干净轮廓线，高细节。?/g, "")
    .trim();
}

/**
 * 生成视频默认包装：
 * - 前缀「生成视频：」
 * - 不再参数确认、直接生成 N 秒超写实3D
 * - 人物/画风/画幅/禁止项默认约束
 * - AI 三视图无版权声明
 * - 末尾再钉一句「直接生成视频，不再次确认」
 */
export function withGenerateVideoPrefix(
  prompt: string,
  aspectRatio?: string,
  duration?: number,
): string {
  const story = stripVideoWrappers(prompt);
  const locks = buildDefaultLocks(aspectRatio, duration);
  const body = story ? `${story}\n\n${locks}` : locks;
  return `${VIDEO_INTENT}${body}\n\n${DIRECT_GEN_SUFFIX}`;
}
