export type ShotStatus =
  | "pending"
  | "scripting"
  | "imaging"
  | "animating"
  | "ready"
  | "error";

export type SeedanceVariant = "mini" | "fast";
export type JimengRegion = "cn" | "us" | "hk" | "jp" | "sg";
/** 豆包为主；即梦、小云雀为辅助 */
export type VideoProvider = "mock" | "doubao" | "jimeng" | "xyq";

export type DialogueLineKind =
  | "dialogue"
  | "monologue"
  | "aside"
  | "inner";

/** 单条台词：对白 / 独白 / 旁白 / 内心 */
export interface DialogueLine {
  id: string;
  kind: DialogueLineKind;
  /** 说话人；旁白可空 */
  speaker?: string;
  text: string;
}

/** 人物首次登场介绍 */
export interface CharacterIntro {
  name: string;
  intro: string;
}

export interface Shot {
  id: string;
  index: number;
  scene: string;
  /** 兼容旧版：多台词扁平摘要 */
  dialogue: string;
  /** 多台词明细（对白/独白/旁白/内心） */
  lines?: DialogueLine[];
  /** 本镜地点名 */
  locationName?: string;
  /** 地名首次出现时的介绍文案 */
  placeIntro?: string;
  /** 本镜首次登场人物介绍 */
  characterIntros?: CharacterIntro[];
  /** 场景空镜专用提示词（无人，比例跟画幅） */
  scenePrompt?: string;
  camera: string;
  imagePrompt: string;
  storyboardPrompt: string;
  /** 场景图（环境） */
  sceneImageUrl?: string;
  /** 首帧 */
  imageUrl?: string;
  /** 末帧 */
  lastFrameUrl?: string;
  videoUrl?: string;
  /**
   * 本镜视频秒数（4–15）。未设时用项目 durationPerShot。
   */
  duration?: number;
  status: ShotStatus;
  error?: string;
  usedAccountLabel?: string;
  usedModel?: string;
  /** 本次生成实际尝试过的通道 */
  triedChannels?: VideoProvider[];
  /**
   * 生成本镜视频时勾选的角色（id 或 name）。
   * undefined = 按分镜自动识别；[] = 不传角色图。
   */
  videoCharacterKeys?: string[];
  /**
   * 生成视频时豆包返回的对话线程（可继续回复）
   */
  videoChat?: {
    conversationId?: string;
    matchedCharacterNames?: string[];
    messages: VideoChatMessage[];
  };
}

export interface VideoChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface CharacterCard {
  /** 稳定键，避免改名时输入框失焦 */
  id?: string;
  name: string;
  appearance: string;
  /** 角色参考图（上传或三视图写入） */
  referenceImageUrl?: string;
  /** 角色三视图 */
  threeViewUrl?: string;
  locked: boolean;
}

export interface DramaProject {
  id: string;
  title: string;
  premise: string;
  style: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  /** 新建分镜的默认秒数；各镜可单独覆盖 Shot.duration */
  durationPerShot: number;
  characters: CharacterCard[];
  shots: Shot[];
  coverUrl?: string;
  /** 项目侧缓存的豆包对话 id（权威值在当前账号 JimengAccount.conversationId） */
  videoConversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JimengAccount {
  id: string;
  label: string;
  sessionId: string;
  /**
   * 可选：官网整段 Cookie（含 ttwid / msToken 等）。
   * 视频技能比生图更挑鉴权，粘贴整段 Cookie 更稳。
   */
  cookieHeader?: string;
  region: JimengRegion;
  /** 账号适用平台（豆包仅展示/额度标记，不参与即梦 session 调度） */
  platform: "doubao" | "jimeng" | "xyq" | "any";
  /** 登录手机号（脱敏展示可用） */
  phone?: string;
  loginAt?: string;
  enabled: boolean;
  usedCount: number;
  /** @deprecated 已取消账号冷却，加载时会清空 */
  cooldownUntil?: number;
  lastError?: string;
  /**
   * 该豆包账号专用的网页对话 id。
   * 每个账号固定复用一个聊天窗口，不另开新会话。
   */
  conversationId?: string;
}

export interface ApiSettings {
  useMock: boolean;
  videoProvider: VideoProvider;
  autoFallback: boolean;
  fallbackProviders: VideoProvider[];
  /** 兼容旧字段：切换通道时同步为当前基址 */
  jimengApiBase: string;
  doubaoApiBase: string;
  /** 即梦兼容代理（jimeng-api），官网直连通常不可用 */
  jimengProxyBase: string;
  /** 小云雀兼容代理 */
  xyqProxyBase: string;
  /** 统一短信登录认证代理（优先）；需实现 /v1/auth/sms/* */
  authProxyBase: string;
  seedanceVariant: SeedanceVariant;
  seedanceMiniModel: string;
  seedanceFastModel: string;
  jimengAccounts: JimengAccount[];
  /**
   * 当前使用的额度账号 id。可存多个账号，但每次只使用这一个，不自动轮换。
   */
  activeAccountId?: string;
  doubaoApiKey: string;
  /** 豆包分镜对话模型 */
  doubaoChatModel: string;
  /** 豆包生图模型 */
  doubaoImageModel: string;
  /**
   * 当前账号豆包对话 id 的镜像（权威值在 JimengAccount.conversationId）。
   * 每账号一个聊天窗；换号时随账号切换。
   */
  doubaoConversationId?: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  falKey: string;
  imageModel: string;
  /**
   * 纯静态 HTML 包使用的 HTTPS 在线 API 根地址，如 https://api.example.com
   * 留空则静态包走本地演示；Node 网页包可留空用同源 /api
   */
  apiBaseUrl?: string;
}

export const DOUBAO_API_URL = "https://www.doubao.com";
export const JIMENG_API_URL = "https://jimeng.jianying.com";
/** 小云雀（剪映团队） */
export const XYQ_API_URL = "https://xyq.jianying.com";

export const PROVIDER_PRESETS = {
  doubao: {
    id: "doubao" as const,
    label: "豆包",
    role: "primary" as const,
    videoProvider: "doubao" as const,
    apiBase: DOUBAO_API_URL,
    seedanceMiniModel: "doubao-web-seedance-mini",
    seedanceFastModel: "doubao-web-seedance-fast",
    hint: "主通道 · 线上豆包网页 session · 对话/生图/视频",
  },
  jimeng: {
    id: "jimeng" as const,
    label: "即梦",
    role: "auxiliary" as const,
    videoProvider: "jimeng" as const,
    apiBase: JIMENG_API_URL,
    seedanceMiniModel: "jimeng-video-seedance-2.0-mini",
    seedanceFastModel: "jimeng-video-seedance-2.0-fast",
    hint: "可选 · 需本地兼容代理",
  },
  xyq: {
    id: "xyq" as const,
    label: "小云雀",
    role: "auxiliary" as const,
    videoProvider: "xyq" as const,
    apiBase: XYQ_API_URL,
    seedanceMiniModel: "jimeng-video-seedance-2.0-mini",
    seedanceFastModel: "jimeng-video-seedance-2.0-fast",
    hint: "可选 · 需本地兼容代理",
  },
} as const;

export type ProviderPresetId = keyof typeof PROVIDER_PRESETS;

export const DEFAULT_SETTINGS: ApiSettings = {
  /** 默认在线版：走原线上接口，不演示 */
  useMock: false,
  videoProvider: "doubao",
  autoFallback: false,
  fallbackProviders: [],
  jimengApiBase: DOUBAO_API_URL,
  doubaoApiBase: DOUBAO_API_URL,
  jimengProxyBase: "http://127.0.0.1:5100",
  xyqProxyBase: "http://127.0.0.1:5200",
  authProxyBase: "",
  seedanceVariant: "mini",
  seedanceMiniModel: PROVIDER_PRESETS.doubao.seedanceMiniModel,
  seedanceFastModel: PROVIDER_PRESETS.doubao.seedanceFastModel,
  jimengAccounts: [],
  activeAccountId: "",
  doubaoApiKey: "",
  doubaoChatModel: "doubao-web",
  doubaoImageModel: "doubao-seedream-4-5-251128",
  /** 豆包网页固定复用的对话 id（视频/续聊不新建） */
  doubaoConversationId: "",
  llmBaseUrl: "https://www.doubao.com",
  llmApiKey: "",
  llmModel: "doubao-web",
  falKey: "",
  imageModel: "doubao-seedream-4-5-251128",
  apiBaseUrl: "",
};

/** 画面风格：默认 CG 国漫电影级；可切 CG3D 建模 */
export const STYLE_PRESETS = [
  {
    id: "guoman",
    label: "CG国漫电影级",
    prompt:
      "CG Chinese comic / guoman cinematic film render, clean outlines, high detail, consistent lighting and material quality, expressive facial features, detailed costume and hair, movie-grade color and atmosphere, not flat 2D illustration, not watercolor",
  },
  {
    id: "cg3d",
    label: "CG3D建模",
    prompt:
      "CG 3D modeled character, production-quality topology look, detailed fabric and hair shaders, studio-grade lighting, Unreal/Maya render aesthetic, clean silhouette, high detail, not flat illustration",
  },
] as const;

export const DEFAULT_STYLE_ID = "guoman" as const;

/** Seedance / 豆包视频常用时长范围 */
export function clampShotDuration(
  sec?: number | null,
  fallback = 15,
): number {
  const n = Math.round(Number(sec));
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(15, Math.max(4, base));
}

/** 本镜实际生成秒数：镜级优先，否则项目默认 */
export function resolveShotDuration(
  shot: Pick<{ duration?: number }, "duration">,
  projectDefault?: number,
): number {
  return clampShotDuration(
    shot.duration ?? projectDefault ?? 15,
    projectDefault ?? 15,
  );
}

export const REGION_PREFIX: Record<JimengRegion, string> = {
  cn: "",
  us: "us-",
  hk: "hk-",
  jp: "jp-",
  sg: "sg-",
};
