/** 镜叙安卓端与网页版共用的数据模型、提示词与本地存储。生成请求打到本机/局域网的 aisource 服务。 */

import {
  deleteMedia,
  dehydrateCharacters,
  dehydrateProjectMedia,
  hydrateCharacters,
  hydrateProjectMedia,
  isDataUrl,
  isEphemeralMediaUrl,
  isMediaRef,
  isPortableMediaUrl as isPortableMediaUrlIdb,
  putDataUrl,
  toPersistentMediaUrl as toPersistentMediaUrlIdb,
} from "./media-db.js";

export { deleteMedia, isDataUrl, isMediaRef, putDataUrl };

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
];

export const DEFAULT_SETTINGS = {
  useMock: false,
  videoProvider: "doubao",
  autoFallback: false,
  fallbackProviders: [],
  jimengApiBase: "https://www.doubao.com",
  doubaoApiBase: "https://www.doubao.com",
  jimengProxyBase: "http://127.0.0.1:5100",
  xyqProxyBase: "http://127.0.0.1:5200",
  authProxyBase: "",
  seedanceVariant: "mini",
  seedanceMiniModel: "doubao-web-seedance-mini",
  seedanceFastModel: "doubao-web-seedance-fast",
  jimengAccounts: [],
  activeAccountId: "",
  doubaoApiKey: "",
  doubaoChatModel: "doubao-web",
  doubaoImageModel: "doubao-seedream-4-5-251128",
  doubaoConversationId: "",
  llmBaseUrl: "https://www.doubao.com",
  llmApiKey: "",
  llmModel: "doubao-web",
  falKey: "",
  imageModel: "doubao-seedream-4-5-251128",
  apiBaseUrl: "",
};

const SETTINGS_KEY = "jingxu-settings";
const PROJECTS_KEY = "jingxu-projects";
const ACTIVE_KEY = "jingxu-active-project";
/** 跨项目角色库：导入/修改角色后写入，新建项目可恢复 */
const CHARACTER_LIBRARY_KEY = "jingxu-character-library";

export const LINE_KINDS = [
  { id: "dialogue", label: "对白" },
  { id: "monologue", label: "独白" },
  { id: "aside", label: "旁白" },
  { id: "inner", label: "内心" },
];

export const STATUS_LABEL = {
  pending: "待生成",
  scripting: "写分镜",
  imaging: "出图中",
  animating: "出片中",
  ready: "已完成",
  error: "失败",
};

const RENDER_SUFFIX =
  "【画面默认】CG国漫电影级渲染，干净轮廓线，高细节，统一光影质感；人体结构正常，五官清晰，服装细节完整；禁止换脸、畸形手指、扭曲五官、穿模、画面水印与多余文字。 Default: CG Chinese comic / guoman cinematic render, clean outlines, high detail, consistent lighting, anatomically correct, no face swap, no deformed hands, no watermark.";

const SCENE_SUFFIX =
  "【场景默认】纯环境建立镜头，CG国漫电影级场景，统一光影与体积感；画面禁止出现任何人物、人脸、人体剪影、路人、肢体。 Default scene: CG guoman cinematic environment establishing shot only, no people, no characters, no human silhouette.";

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clampShotDuration(sec, fallback = 15) {
  const n = Math.round(Number(sec));
  const base = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(15, Math.max(4, base));
}

export function resolveShotDuration(shot, projectDefault) {
  return clampShotDuration(shot?.duration ?? projectDefault ?? 15, projectDefault ?? 15);
}

function readJson(key, fallback) {
  try {
    const raw = uni.getStorageSync(key);
    if (!raw) return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  uni.setStorageSync(key, JSON.stringify(value));
}

export function loadSettings() {
  const parsed = readJson(SETTINGS_KEY, null) || {};
  const accounts = Array.isArray(parsed.jimengAccounts)
    ? parsed.jimengAccounts.map((a) => ({
        ...a,
        platform: a.platform || "any",
        cooldownUntil: undefined,
      }))
    : [];
  const merged = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    jimengAccounts: accounts,
    activeAccountId: typeof parsed.activeAccountId === "string" ? parsed.activeAccountId : "",
    apiBaseUrl: typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : "",
  };
  const active = resolveActiveAccountId(merged);
  merged.activeAccountId = active || "";
  return merged;
}

export function saveSettings(settings) {
  writeJson(SETTINGS_KEY, settings);
  return settings;
}

export function getApiBase() {
  return (loadSettings().apiBaseUrl || "").trim().replace(/\/+$/, "");
}

/** 与 PC 端 UPSTREAM_PATHS 一致（Studio 调用这些路径） */
export const UPSTREAM_PATHS = {
  script: "/samantha/chat/completion",
  enrich: "/samantha/chat/enrich",
  chatReply: "/samantha/chat/reply",
  image: "/api/v3/images/generations",
  video: "/chat/completion",
  videoArk: "/api/v3/contents/generations/tasks",
  authSendCode: "/passport/web/send_code/",
  authLogin: "/passport/web/sms_login/",
  authCheckSession: "/passport/account/info/v2/",
  tmpMediaPrefix: "/tmp-media",
  doubaoCheck: "/passport/account/info/v2/",
  jimengCheck: "/jimeng/check",
  frameFromVideo: "/api/frame-from-video",
};

/**
 * 上游原路径 / 旧短路径 → Next 本站 /api/*
 * 对齐 PC src/lib/api-fetch.ts toLocalApiPath，避免分镜 404
 */
const UPSTREAM_TO_LOCAL_API = {
  [UPSTREAM_PATHS.script]: "/api/script",
  [UPSTREAM_PATHS.enrich]: "/api/enrich",
  [UPSTREAM_PATHS.chatReply]: "/api/chat-reply",
  [UPSTREAM_PATHS.image]: "/api/image",
  [UPSTREAM_PATHS.video]: "/api/video",
  [UPSTREAM_PATHS.videoArk]: "/api/video",
  [UPSTREAM_PATHS.authSendCode]: "/api/auth/send-code",
  [UPSTREAM_PATHS.authSendCode.replace(/\/$/, "")]: "/api/auth/send-code",
  [UPSTREAM_PATHS.authLogin]: "/api/auth/login",
  [UPSTREAM_PATHS.authLogin.replace(/\/$/, "")]: "/api/auth/login",
  [UPSTREAM_PATHS.authCheckSession]: "/api/auth/check-session",
  [UPSTREAM_PATHS.authCheckSession.replace(/\/$/, "")]: "/api/auth/check-session",
  [UPSTREAM_PATHS.jimengCheck]: "/api/jimeng/check",
  [UPSTREAM_PATHS.doubaoCheck]: "/api/auth/check-session",
  "/script": "/api/script",
  "/image": "/api/image",
  "/video": "/api/video",
  "/enrich": "/api/enrich",
  "/chat-reply": "/api/chat-reply",
  "/frame-from-video": "/api/frame-from-video",
  "/auth/send-code": "/api/auth/send-code",
  "/auth/login": "/api/auth/login",
  "/auth/check-session": "/api/auth/check-session",
  "/doubao/check": "/api/doubao/check",
  "/jimeng/check": "/api/jimeng/check",
  "/api/v3/images/generations": "/api/image",
  "/api/v3/contents/generations/tasks": "/api/video",
};

function normalizePathKey(path) {
  const clean = (path || "").split("?")[0] || path;
  if (clean.length > 1 && clean.endsWith("/")) return clean;
  return clean.replace(/\/$/, "") || "/";
}

export function toLocalApiPath(path) {
  const clean = normalizePathKey(path);
  if (clean.startsWith("/api/") && !clean.startsWith("/api/v3/")) return clean;
  const mapped =
    UPSTREAM_TO_LOCAL_API[clean] || UPSTREAM_TO_LOCAL_API[`${clean}/`];
  if (mapped) return mapped;
  if (clean.startsWith(`${UPSTREAM_PATHS.tmpMediaPrefix}/`)) {
    return `/api${clean}`;
  }
  return clean.startsWith("/") ? clean : `/${clean}`;
}

/** 与 PC src/lib/upstream-paths.ts REQUEST_PATH_TO_ENDPOINT 一致 */
const REQUEST_PATH_TO_ENDPOINT = {
  "/api/script": "script",
  "/script": "script",
  [UPSTREAM_PATHS.script]: "script",
  "/api/image": "image",
  "/image": "image",
  [UPSTREAM_PATHS.image]: "image",
  "/api/video": "video",
  "/video": "video",
  [UPSTREAM_PATHS.video]: "video",
  [UPSTREAM_PATHS.videoArk]: "videoArk",
  "/api/enrich": "enrich",
  "/enrich": "enrich",
  [UPSTREAM_PATHS.enrich]: "enrich",
  "/api/chat-reply": "chatReply",
  "/chat-reply": "chatReply",
  [UPSTREAM_PATHS.chatReply]: "chatReply",
  "/api/auth/send-code": "authSendCode",
  "/auth/send-code": "authSendCode",
  [UPSTREAM_PATHS.authSendCode.replace(/\/$/, "")]: "authSendCode",
  [UPSTREAM_PATHS.authSendCode]: "authSendCode",
  "/api/auth/login": "authLogin",
  "/auth/login": "authLogin",
  [UPSTREAM_PATHS.authLogin.replace(/\/$/, "")]: "authLogin",
  [UPSTREAM_PATHS.authLogin]: "authLogin",
  "/api/auth/check-session": "authCheckSession",
  "/auth/check-session": "authCheckSession",
  "/api/doubao/check": "authCheckSession",
  "/doubao/check": "authCheckSession",
  [UPSTREAM_PATHS.authCheckSession.replace(/\/$/, "")]: "authCheckSession",
  [UPSTREAM_PATHS.authCheckSession]: "authCheckSession",
};

const ENDPOINT_DEFAULT_PATH = {
  script: UPSTREAM_PATHS.script,
  image: UPSTREAM_PATHS.image,
  video: UPSTREAM_PATHS.video,
  videoArk: UPSTREAM_PATHS.videoArk,
  enrich: UPSTREAM_PATHS.enrich,
  chatReply: UPSTREAM_PATHS.chatReply,
  authSendCode: UPSTREAM_PATHS.authSendCode,
  authLogin: UPSTREAM_PATHS.authLogin,
  authCheckSession: UPSTREAM_PATHS.authCheckSession,
};

/**
 * 未加载本目录 config.js 时的默认地址，内容与 jingxu-android/config.js 相同。
 * H5 会先执行 config.js，此时以 window.__JINGXU_ENDPOINTS__ 为准。
 */
function defaultEndpoints() {
  const base = resolveApiBaseFromWindow();
  const DOUBAO = "https://www.doubao.com";
  const online = (origin, p) => (base ? base + p : origin + p);
  const ARK = "https://ark.cn-beijing.volces.com";
  return {
    script: online(DOUBAO, "/samantha/chat/completion"),
    enrich: base ? base + "/samantha/chat/enrich" : DOUBAO + "/samantha/chat/completion",
    chatReply: base ? base + "/samantha/chat/reply" : DOUBAO + "/samantha/chat/completion",
    image: online(ARK, "/api/v3/images/generations"),
    video: online(DOUBAO, "/chat/completion"),
    videoArk: online(ARK, "/api/v3/contents/generations/tasks"),
    authSendCode: online(DOUBAO, "/passport/web/send_code/"),
    authLogin: online(DOUBAO, "/passport/web/sms_login/"),
    authCheckSession: online(DOUBAO, "/passport/account/info/v2/"),
    mediaBase: base || DOUBAO,
  };
}

function resolveApiBaseFromWindow() {
  if (typeof window === "undefined") return "";
  return String(window.__JINGXU_API_BASE__ || "").trim().replace(/\/+$/, "");
}

/** 与 PC resolveApiBase 相同：config.js 的根优先，其次设置里的服务根 */
export function resolveApiBase() {
  const fromWindow = resolveApiBaseFromWindow();
  if (fromWindow) return fromWindow;
  return getApiBase();
}

function resolveEndpoints() {
  if (typeof window !== "undefined" && window.__JINGXU_ENDPOINTS__) {
    return window.__JINGXU_ENDPOINTS__;
  }
  return defaultEndpoints();
}

/**
 * 与 PC 静态站 resolveStaticRequestUrl 的走向一致，但由安卓自己代理：
 * - H5 开发：同源 /api/*，vite 按本目录 config.js 改写到线上地址（不打 Next）
 * - 填写了自建根：根 + /api/*
 * - 否则：config.js 里的完整线上地址（App 直连）
 */
export function resolveRequestUrl(path) {
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const local = toLocalApiPath(apiPath);

  // #ifdef H5
  if (process.env.NODE_ENV !== "production") return local;
  // #endif

  const base = resolveApiBase();
  if (base) {
    if (local.startsWith("/api/tmp-media/") || local === "/api/frame-from-video") {
      return `${base}${local}`;
    }
    return `${base}${local}`;
  }

  // 无自建根：对齐 PC resolveStaticRequestUrl（config.js 逐项完整地址）
  const clean = normalizePathKey(local);
  const ep = resolveEndpoints();
  const key = REQUEST_PATH_TO_ENDPOINT[clean] || REQUEST_PATH_TO_ENDPOINT[`${clean}/`];
  if (key) {
    const full = ep[key] && String(ep[key]).trim();
    if (full) return full;
    const suffix = ENDPOINT_DEFAULT_PATH[key];
    if (suffix && resolveApiBaseFromWindow()) {
      return `${resolveApiBaseFromWindow()}${suffix}`;
    }
  }
  if (clean === "/api/frame-from-video" || clean === "/frame-from-video") return "";
  return local;
}

export function loadProjects() {
  const list = readJson(PROJECTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** 同步写入（仅元数据兜底）；完整媒体请用 saveProjectAsync */
export function saveProject(project) {
  const list = loadProjects().filter((p) => p.id !== project.id);
  list.unshift({ ...project, updatedAt: new Date().toISOString() });
  try {
    writeJson(PROJECTS_KEY, list);
    writeJson(ACTIVE_KEY, project.id);
  } catch (e) {
    throw new Error(
      e?.message ||
        "本地存储失败（可能因图片过大）。请稍后重试，系统会把大图写入缓存。",
    );
  }
}

/** 项目媒体脱水后写入 storage，并同步角色库缓存 */
export async function saveProjectAsync(project) {
  const dehydrated = await dehydrateProjectMedia({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  saveProject(dehydrated);
  await saveCharacterLibrary(dehydrated.characters || []);
  return dehydrated;
}

export async function loadActiveProjectAsync() {
  const raw = loadActiveProject();
  if (!raw) return null;
  return hydrateProjectMedia(raw);
}

export async function saveCharacterLibrary(characters) {
  const list = await dehydrateCharacters(characters || []);
  writeJson(CHARACTER_LIBRARY_KEY, {
    updatedAt: new Date().toISOString(),
    characters: list,
  });
  return list;
}

export async function loadCharacterLibrary() {
  const pack = readJson(CHARACTER_LIBRARY_KEY, null);
  if (!pack || !Array.isArray(pack.characters) || !pack.characters.length) {
    return [];
  }
  return hydrateCharacters(pack.characters);
}

export function deleteProject(id) {
  writeJson(
    PROJECTS_KEY,
    loadProjects().filter((p) => p.id !== id),
  );
  if (readJson(ACTIVE_KEY, "") === id) writeJson(ACTIVE_KEY, "");
}

export function loadActiveProject() {
  const id = readJson(ACTIVE_KEY, "");
  if (!id) return null;
  return loadProjects().find((p) => p.id === id) || null;
}

export function setActiveProjectId(id) {
  writeJson(ACTIVE_KEY, id || "");
}

function isReady(account) {
  return Boolean(account?.enabled && account.sessionId?.trim());
}

export function resolveActiveAccountId(settings) {
  const accounts = settings.jimengAccounts || [];
  if (!accounts.length) return "";
  const activeId = (settings.activeAccountId || "").trim();
  if (activeId && accounts.some((a) => a.id === activeId)) return activeId;
  const ready = accounts.find(isReady);
  return (ready || accounts[0])?.id || "";
}

export function resolveSelectedAccount(settings) {
  const id = resolveActiveAccountId(settings);
  if (!id) return null;
  return (settings.jimengAccounts || []).find((a) => a.id === id) || null;
}

export function hasDoubaoWebSession(settings) {
  const acc = resolveSelectedAccount(settings);
  return Boolean(acc?.enabled && acc.platform === "doubao" && acc.sessionId?.trim());
}

export function withActiveAccount(settings, accountId) {
  if (!(settings.jimengAccounts || []).some((a) => a.id === accountId)) return settings;
  const acc = settings.jimengAccounts.find((a) => a.id === accountId);
  return {
    ...settings,
    activeAccountId: accountId,
    doubaoConversationId: acc?.conversationId || "",
  };
}

export const PROVIDER_PRESETS = {
  doubao: {
    videoProvider: "doubao",
    apiBase: "https://www.doubao.com",
    seedanceMiniModel: "doubao-web-seedance-mini",
    seedanceFastModel: "doubao-web-seedance-fast",
  },
  jimeng: {
    videoProvider: "jimeng",
    apiBase: "https://jimeng.jianying.com",
    seedanceMiniModel: "jimeng-video-seedance-2.0-mini",
    seedanceFastModel: "jimeng-video-seedance-2.0-fast",
  },
  xyq: {
    videoProvider: "xyq",
    apiBase: "https://xyq.jianying.com",
    seedanceMiniModel: "jimeng-video-seedance-2.0-mini",
    seedanceFastModel: "jimeng-video-seedance-2.0-fast",
  },
};

/** 与网页 applyProviderPreset 一致：切通道时同步模型与基址 */
export function applyProviderPreset(settings, id) {
  const preset = PROVIDER_PRESETS[id];
  if (!preset) return settings;
  const next = {
    ...settings,
    useMock: false,
    videoProvider: preset.videoProvider,
    seedanceMiniModel: preset.seedanceMiniModel,
    seedanceFastModel: preset.seedanceFastModel,
  };
  if (id === "doubao") {
    next.jimengApiBase = settings.doubaoApiBase || preset.apiBase;
    next.doubaoApiBase = settings.doubaoApiBase || preset.apiBase;
    next.autoFallback = false;
    next.fallbackProviders = [];
  } else if (id === "jimeng") {
    next.jimengApiBase = settings.jimengProxyBase;
  } else if (id === "xyq") {
    next.jimengApiBase = settings.xyqProxyBase;
  }
  return next;
}

export function applyPresetForPlatform(settings, platform) {
  if (platform === "doubao" || platform === "jimeng" || platform === "xyq") {
    return applyProviderPreset(settings, platform);
  }
  return settings;
}

/** 登录/粘贴写入账号：按 session 或手机号合并，并切到对应通道 */
export function upsertLoggedInAccount(settings, account) {
  let next = { ...settings, useMock: false };
  const exists = (next.jimengAccounts || []).find(
    (a) =>
      (a.sessionId && account.sessionId && a.sessionId === account.sessionId) ||
      (a.phone && account.phone && a.phone === account.phone && a.platform === account.platform),
  );
  const activeId = exists?.id || account.id;
  const mergedAccounts = exists
    ? next.jimengAccounts.map((a) =>
        a.id === exists.id
          ? {
              ...a,
              ...account,
              id: a.id,
              usedCount: a.usedCount,
              conversationId: account.conversationId || a.conversationId,
            }
          : a,
      )
    : [account, ...(next.jimengAccounts || [])];
  next = withActiveAccount({ ...next, jimengAccounts: mergedAccounts }, activeId);
  return applyPresetForPlatform(next, account.platform);
}

function isRealConversationId(id) {
  const v = (id || "").trim();
  return Boolean(v) && v !== "0" && !v.startsWith("static-");
}

export function resolveAccountConversationId(settings) {
  const selected = resolveSelectedAccount(settings);
  if (selected?.platform === "doubao" && isRealConversationId(selected.conversationId)) {
    return selected.conversationId.trim();
  }
  if (
    selected?.platform === "doubao" &&
    !selected.conversationId?.trim() &&
    isRealConversationId(settings.doubaoConversationId)
  ) {
    return settings.doubaoConversationId.trim();
  }
  return "";
}

export function persistAccountConversationId(settings, conversationId, accountId) {
  const id = (conversationId || "").trim();
  if (!isRealConversationId(id)) return settings;
  const targetId = (accountId || "").trim() || resolveActiveAccountId(settings);
  if (!targetId) return { ...settings, doubaoConversationId: id };
  return {
    ...settings,
    doubaoConversationId: id,
    jimengAccounts: (settings.jimengAccounts || []).map((a) =>
      a.id === targetId ? { ...a, conversationId: id } : a,
    ),
  };
}

/**
 * 解析「当前账号 + 本项目」专用对话窗。
 * 不回落账号全局 conversationId，避免跨项目串窗。
 */
export function resolveProjectConversationId(project, settings, accountId) {
  if (!project) return "";
  const targetId =
    String(accountId || "").trim() ||
    resolveActiveAccountId(settings) ||
    String(settings?.activeAccountId || "").trim();
  if (!targetId) return "";
  const map = project.videoConversationsByAccount || {};
  const mapped = map[targetId];
  if (isRealConversationId(mapped)) return String(mapped).trim();
  // 旧单值：仅 map 为空时认领给当前账号，避免换号串窗
  if (
    Object.keys(map).length === 0 &&
    isRealConversationId(project.videoConversationId)
  ) {
    return String(project.videoConversationId).trim();
  }
  return "";
}

/** 写入项目「账号→对话」映射，并镜像旧字段 videoConversationId */
export function withProjectConversationId(project, conversationId, accountId) {
  const id = String(conversationId || "").trim();
  const accId = String(accountId || "").trim();
  if (!project || !isRealConversationId(id) || !accId) return project;
  return {
    ...project,
    videoConversationId: id,
    videoConversationsByAccount: {
      ...(project.videoConversationsByAccount || {}),
      [accId]: id,
    },
  };
}

export function formatAccountLabel(account) {
  if (!account) return "未选账号";
  const plat =
    account.platform === "doubao"
      ? "豆包"
      : account.platform === "jimeng"
        ? "即梦"
        : account.platform === "xyq"
          ? "小云雀"
          : "账号";
  return `${plat} · ${account.label || account.phone || account.id}`;
}

export function maskPhone(phone) {
  const p = String(phone || "");
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

export function aspectHint(ratio) {
  if (ratio === "16:9") return "横屏 16:9 构图";
  if (ratio === "1:1") return "正方形 1:1 构图";
  return "竖屏 9:16 构图";
}

export function aspectEn(ratio) {
  if (ratio === "16:9") return "16:9 widescreen";
  if (ratio === "1:1") return "1:1 square";
  return "9:16 vertical";
}

export function ensureRenderStyle(prompt, stylePreset) {
  const parts = [];
  const main = (prompt || "").trim();
  if (main) parts.push(main);
  const style = (stylePreset || "").trim();
  if (style && !main.includes(style.slice(0, 36))) parts.push(style);
  let out = parts.join("\n").trim();
  if (!out.includes("【画面默认】")) out = `${out}\n${RENDER_SUFFIX}`.trim();
  if (!/CG国漫|国漫电影|guoman/i.test(out)) {
    out = `${out}\nCG国漫电影级渲染，干净轮廓线，高细节。`;
  }
  return out;
}

export function ensureSceneRenderStyle(prompt, stylePreset) {
  const parts = [];
  const main = (prompt || "").trim();
  if (main) parts.push(main);
  const style = (stylePreset || "")
    .trim()
    .replace(/人像|皮肤|毛孔|角色|五官/g, "环境");
  if (style && !main.includes(style.slice(0, 28))) parts.push(style);
  let out = parts.join("\n").trim().replace(/【画面默认】[^\n]*/g, "").trim();
  if (!out.includes("【场景默认】")) out = `${out}\n${SCENE_SUFFIX}`.trim();
  return out;
}

export function buildCharacterThreeViewPrompt(input) {
  return ensureRenderStyle(
    `角色设定三视图 character turnaround sheet，同一角色正面、侧面、背面并排，纯色浅灰背景，全身站立，细节清晰，服装与发型一致。角色名：${input.name}。外貌：${input.appearance}。${aspectHint(input.aspectRatio)}，禁止文字水印，高清。 ${aspectEn(input.aspectRatio)}.`,
    input.style,
  );
}

export function buildSceneImagePrompt(input) {
  const place = [input.locationName, input.placeIntro].filter(Boolean).join("，");
  const body = input.scenePrompt?.trim()
    ? `${input.scenePrompt.trim()}。场景：${input.scene}。${place ? `地点：${place}。` : ""}${aspectHint(input.aspectRatio)}，无人像。 ${aspectEn(input.aspectRatio)}.`
    : `电影感场景空镜，纯环境建立镜头，画面中不要出现任何人物、人脸、剪影、路人。只拍建筑、自然、道具与氛围光影。场景：${input.scene}。${place ? `地点：${place}。` : ""}氛围参考：${(input.storyboardPrompt || "").slice(0, 220)}。${aspectHint(input.aspectRatio)}，无字幕，无人像。 ${aspectEn(input.aspectRatio)}, no people.`;
  return ensureSceneRenderStyle(body, input.style);
}

export function buildFirstFramePrompt(input) {
  return ensureRenderStyle(
    `漫剧关键帧静帧，叙事构图。${input.imagePrompt || input.storyboardPrompt}。场景：${input.scene}。${input.characters ? `角色一致：${input.characters}` : ""} ${aspectHint(input.aspectRatio)}，电影光影，无字幕。 ${aspectEn(input.aspectRatio)}.`,
    input.style,
  );
}

export function buildLastFramePrompt(input) {
  return ensureRenderStyle(
    `漫剧本镜结束定格帧（末帧），承接动作余韵与情绪落点。场景：${input.scene}。分镜：${(input.storyboardPrompt || "").slice(0, 320)}。${input.characters ? `角色一致：${input.characters}` : ""} 与首帧同一角色造型，${aspectHint(input.aspectRatio)}，构图可推进到动作终点，无字幕。 ${aspectEn(input.aspectRatio)}.`,
    input.style,
  );
}

export function characterKey(c) {
  return (c?.id || c?.name || "").trim();
}

const SKIP_SPEAKERS = new Set([
  "旁白",
  "内心",
  "独白",
  "画外音",
  "系统",
  "字幕",
  "主角",
  "配角",
  "对手",
  "众人",
  "群众",
  "观众",
]);

function normName(s) {
  return (s || "").replace(/\s+/g, "").toLowerCase();
}

export function matchShotCharacters(shot, characters) {
  if (!characters?.length) return [];
  const usable = characters.filter((c) => c.name?.trim());
  const byNorm = new Map(usable.map((c) => [normName(c.name), c]));
  const hit = new Map();
  const add = (raw, force = false) => {
    const name = (raw || "").trim();
    if (!name || SKIP_SPEAKERS.has(name)) return;
    const c = byNorm.get(normName(name));
    if (!c) return;
    if (hit.size >= 4 && !force && !hit.has(characterKey(c))) return;
    hit.set(characterKey(c), c);
  };
  for (const intro of shot.characterIntros || []) add(intro.name, true);
  for (const line of shot.lines || []) {
    if (line.kind === "aside") continue;
    add(line.speaker, true);
  }
  const hay = [shot.scene, shot.dialogue, shot.storyboardPrompt, shot.imagePrompt, ...(shot.lines || []).map((l) => l.text)]
    .filter(Boolean)
    .join("\n");
  for (const m of hay.matchAll(/([\u4e00-\u9fff·]{2,6})\s*[：:]/g)) add(m[1]);
  if (hit.size < 4) {
    const sorted = [...usable].sort((a, b) => b.name.trim().length - a.name.trim().length);
    for (const c of sorted) {
      if (hit.size >= 4) break;
      const n = c.name.trim();
      if (n.length < 2) continue;
      if (/群体|众人|护卫|族人|士兵|弟子|路人/.test(n)) continue;
      if (hay.includes(n)) add(n);
    }
  }
  return [...hit.values()].slice(0, 4);
}

/** 与 PC shot-script.ts flattenDialogue 一致 */
export function flattenDialogue(lines) {
  if (!lines?.length) return "";
  return lines
    .filter((l) => l.text?.trim())
    .map((l) => {
      if (l.kind === "aside") return `【旁白】${l.text.trim()}`;
      if (l.kind === "inner") {
        return l.speaker
          ? `${l.speaker}（内心）${l.text.trim()}`
          : `【内心】${l.text.trim()}`;
      }
      if (l.kind === "monologue") {
        return l.speaker
          ? `${l.speaker}（独白）${l.text.trim()}`
          : `【独白】${l.text.trim()}`;
      }
      return l.speaker ? `${l.speaker}：${l.text.trim()}` : l.text.trim();
    })
    .join(" / ");
}

/** 与 PC normalizeLines 一致：空 lines 时用 dialogue 兜底 */
function normalizeLines(raw, fallbackDialogue) {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((item) => {
      const o = item || {};
      const kindRaw = String(o.kind || o.type || "dialogue").toLowerCase();
      let kind = "dialogue";
      if (/独白|monologue/.test(kindRaw)) kind = "monologue";
      else if (/旁白|aside|narrat/.test(kindRaw)) kind = "aside";
      else if (/内心|inner|thought/.test(kindRaw)) kind = "inner";
      return {
        id: o.id || uid("line"),
        kind,
        speaker: o.speaker || "",
        text: (o.text || o.content || "").trim(),
      };
    });
  }
  if (fallbackDialogue?.trim()) {
    return [{ id: uid("line"), kind: "dialogue", speaker: "", text: fallbackDialogue.trim() }];
  }
  return [];
}

/** 与 PC shot-script.ts composeVideoPrompt 一致 */
export function composeVideoPrompt(shot, stylePreset, aspectRatio) {
  const parts = [];
  if (aspectRatio?.trim()) parts.push(`画幅：${aspectRatio.trim()}`);
  if (shot.locationName?.trim()) parts.push(`地点：${shot.locationName.trim()}`);
  if (shot.placeIntro?.trim()) parts.push(`地名首次介绍：${shot.placeIntro.trim()}`);
  if (shot.characterIntros?.length) {
    const intros = shot.characterIntros
      .filter((c) => c.name || c.intro)
      .map((c) => (c.intro?.trim() ? `${c.name}（首次登场：${c.intro.trim()}）` : `${c.name}首次登场`))
      .join("；");
    if (intros) parts.push(`人物介绍：${intros}`);
  }
  const lines = shot.lines?.length ? shot.lines : normalizeLines(undefined, shot.dialogue);
  if (lines.length) {
    const speech = lines
      .filter((l) => l.text?.trim())
      .map((l) => {
        if (l.kind === "aside") return `旁白：${l.text.trim()}`;
        if (l.kind === "inner") return `${l.speaker || "角色"}内心独白：${l.text.trim()}`;
        if (l.kind === "monologue") return `${l.speaker || "角色"}独白：${l.text.trim()}`;
        return `${l.speaker || "角色"}说：${l.text.trim()}`;
      })
      .join("。");
    if (speech) parts.push(`对白节奏：${speech}`);
  }
  if (shot.storyboardPrompt?.trim()) parts.push(shot.storyboardPrompt.trim());
  else {
    parts.push(
      [shot.scene, shot.camera, flattenDialogue(lines)].filter(Boolean).join("。"),
    );
  }
  return ensureRenderStyle(parts.join("\n"), stylePreset);
}

function parseApiResponseData(raw, statusCode) {
  let data = raw;
  if (typeof data === "string") {
    const text = data.trim();
    if (!text) {
      throw new Error(`服务返回空响应（HTTP ${statusCode}）`);
    }
    if (/^<!DOCTYPE|^<html/i.test(text)) {
      throw new Error(
        `服务返回了网页而不是 JSON（HTTP ${statusCode}）。请检查 config.js 的线上代理地址`,
      );
    }
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `响应不是 JSON（HTTP ${statusCode}）：${text.slice(0, 160)}`,
      );
    }
  }
  if (!data || typeof data !== "object") {
    throw new Error(`响应不是 JSON（HTTP ${statusCode}）`);
  }
  return data;
}

function sessionHeadersFromBody(body) {
  const settings = body && typeof body === "object" ? body.settings : null;
  const sid =
    String(body?.sessionId || "").trim() ||
    resolveSelectedAccount(settings || {})?.sessionId?.trim() ||
    "";
  const cookie =
    String(body?.cookieHeader || "").trim() ||
    resolveSelectedAccount(settings || {})?.cookieHeader?.trim() ||
    (sid ? `sessionid=${sid}; sessionid_ss=${sid}` : "");
  const header = {};
  if (sid) header["x-jingxu-session"] = sid;
  if (cookie) header["x-jingxu-cookie"] = cookie;
  // #ifndef H5
  if (cookie) header.Cookie = cookie;
  // #endif
  return header;
}

export function apiRequest(path, body, timeout = 180000) {
  const url = resolveRequestUrl(path);
  if (!url) {
    const frame = /frame-from-video/.test(path);
    return Promise.reject(
      new Error(
        frame
          ? "当前代理无法截取远程视频尾帧。请使用本镜已生成的视频。"
          : "未配置原线上接口。请检查 config.js 的 __JINGXU_ENDPOINTS__。",
      ),
    );
  }
  const payload = typeof body === "string" ? body : body ?? {};
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: "POST",
      timeout,
      // 用 text 自行解析：部分安卓机把 JSON 当成字符串，旧逻辑会误报「响应不是 JSON」
      dataType: "text",
      header: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...sessionHeadersFromBody(typeof payload === "string" ? {} : payload),
      },
      // 先 stringify，避免 uni H5 把 object 当成 form 发出去
      data: typeof payload === "string" ? payload : JSON.stringify(payload),
      success(res) {
        let data;
        try {
          data = parseApiResponseData(res.data, res.statusCode);
        } catch (e) {
          reject(e instanceof Error ? e : new Error("响应不是 JSON"));
          return;
        }
        if (res.statusCode >= 400 || data.ok === false) {
          const extra =
            data?.debug?.textHint ||
            data?.debug?.fatalHint ||
            data?.debug?.snippet;
          reject(
            new Error(
              [data.error || `HTTP ${res.statusCode}`, extra]
                .filter(Boolean)
                .join(" · "),
            ),
          );
          return;
        }
        resolve(data);
      },
      fail(err) {
        reject(
          new Error(
            err?.errMsg || "网络请求失败，请检查 config.js 的线上代理是否可访问",
          ),
        );
      },
    });
  });
}

export function imageErrorMessage(data, fallback) {
  const extra = data?.debug?.textHint || data?.debug?.fatalHint || data?.debug?.snippet;
  return [data?.error || fallback, extra].filter(Boolean).join(" · ");
}

export function pickImageDataUrl() {
  return new Promise((resolve, reject) => {
    uni.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["album", "camera"],
      success(res) {
        const path = res.tempFilePaths?.[0];
        if (!path) {
          reject(new Error("未选择图片"));
          return;
        }
        // #ifdef H5
        fetch(path)
          .then((r) => r.blob())
          .then(
            (blob) =>
              new Promise((ok, bad) => {
                const reader = new FileReader();
                reader.onload = () => ok(String(reader.result || ""));
                reader.onerror = () => bad(new Error("读取图片失败"));
                reader.readAsDataURL(blob);
              }),
          )
          .then(resolve)
          .catch(reject);
        // #endif
        // #ifndef H5
        uni.getFileSystemManager().readFile({
          filePath: path,
          encoding: "base64",
          success(r) {
            resolve(`data:image/jpeg;base64,${r.data}`);
          },
          fail() {
            reject(new Error("读取图片失败"));
          },
        });
        // #endif
      },
      fail() {
        reject(new Error("已取消选择"));
      },
    });
  });
}

/** —— 与网页版 access-pack / character-pack / downloadJson 对齐 —— */

export const ACCESS_PACK_KIND = "jingxu-access";
export const ACCESS_PACK_VERSION = 1;
export const CHARACTER_PACK_KIND = "jingxu-characters";
export const CHARACTER_PACK_VERSION = 1;
export const PROJECT_PACK_KIND = "jingxu-project";
export const PROJECT_PACK_VERSION = 1;
/** 当前缓存默认绑定的项目名 */
export const DEFAULT_PROJECT_TITLE = "仙帝重生";

/** 新建空项目（标题默认「仙帝重生」） */
export function createEmptyProject(opts = {}) {
  const now = new Date().toISOString();
  return {
    id: uid("proj"),
    title: String(opts.title || DEFAULT_PROJECT_TITLE).trim() || DEFAULT_PROJECT_TITLE,
    premise: String(opts.premise || "").trim(),
    style: String(opts.style || "").trim(),
    aspectRatio: opts.aspectRatio || "9:16",
    durationPerShot: clampShotDuration(opts.durationPerShot, 15),
    characters: Array.isArray(opts.characters) ? opts.characters : [],
    shots: Array.isArray(opts.shots) ? opts.shots : [],
    studioMode: opts.studioMode === "board" ? "board" : "raw",
    studioCaches: opts.studioCaches || undefined,
    coverUrl: opts.coverUrl || undefined,
    videoConversationId: opts.videoConversationId || undefined,
    videoConversationsByAccount: opts.videoConversationsByAccount || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 把当前本机缓存绑定到名为「仙帝重生」的项目：
 * - 已有活动项目且标题为空/未命名 → 改名为仙帝重生
 * - 无项目 → 用角色库建仙帝重生并设为活动
 * - 有项目无活动 → 优先选仙帝重生，否则第一个
 */
export async function ensureDefaultProjectBound(title = DEFAULT_PROJECT_TITLE) {
  const want = String(title || DEFAULT_PROJECT_TITLE).trim() || DEFAULT_PROJECT_TITLE;
  let list = loadProjects();
  let active = loadActiveProject();

  if (active) {
    const t = String(active.title || "").trim();
    if (!t || t === "未命名漫剧") {
      active = { ...active, title: want, updatedAt: new Date().toISOString() };
      await saveProjectAsync(active);
      return hydrateProjectMedia(active);
    }
    return hydrateProjectMedia(active);
  }

  if (list.length) {
    const hit =
      list.find((p) => String(p.title || "").trim() === want) || list[0];
    setActiveProjectId(hit.id);
    return hydrateProjectMedia(hit);
  }

  const lib = await loadCharacterLibrary();
  const project = createEmptyProject({
    title: want,
    characters: lib,
  });
  await saveProjectAsync(project);
  setActiveProjectId(project.id);
  return hydrateProjectMedia(project);
}

/** 导出完整项目包（故事/角色/分镜/媒体全部落实为可携带 URL） */
export async function buildProjectExportPack(project) {
  const hydrated = await hydrateProjectMedia(project);
  const characters = [];
  for (const c of hydrated.characters || []) {
    characters.push(await materializeCharacterImages(c));
  }
  const persistShotUrl = async (u) => {
    if (!u) return undefined;
    const got = await toPersistentMediaUrl(u);
    return got || undefined;
  };
  const shots = [];
  for (const s of hydrated.shots || []) {
    shots.push({
      ...s,
      index: typeof s.index === "number" ? s.index : shots.length,
      sceneImageUrl: await persistShotUrl(s.sceneImageUrl),
      imageUrl: await persistShotUrl(s.imageUrl),
      lastFrameUrl: await persistShotUrl(s.lastFrameUrl),
      videoUrl: await persistShotUrl(s.videoUrl),
    });
  }
  const coverUrl = await persistShotUrl(hydrated.coverUrl);
  return {
    kind: PROJECT_PACK_KIND,
    version: PROJECT_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      ...hydrated,
      characters,
      shots,
      coverUrl,
    },
  };
}

export function downloadProjectPack(filename, pack) {
  return exportJsonFile(filename, pack, { pretty: false });
}

/** 解析导入的项目包（兼容裸 DramaProject / 角色包误选） */
export async function parseProjectImportPack(json) {
  if (!json || typeof json !== "object") {
    throw new Error("无效的项目文件");
  }
  let raw = json;
  if (json.kind === PROJECT_PACK_KIND && json.project) {
    raw = json.project;
  } else if (json.kind === CHARACTER_PACK_KIND) {
    throw new Error("这是角色包，请用「导入角色」；完整项目请导出「项目包」");
  } else if (!json.title && !json.premise && !Array.isArray(json.shots)) {
    throw new Error("不是镜叙项目文件（需含 title / shots）");
  }

  const now = new Date().toISOString();
  const characters = [];
  for (const c of raw.characters || []) {
    characters.push(await materializeCharacterImages({
      ...c,
      id: c.id || uid("char"),
      locked: c.locked ?? true,
    }));
  }
  const shots = (raw.shots || []).map((s, i) => ({
    ...s,
    id: s.id || uid("shot"),
    index: i,
    status: s.status || (s.videoUrl ? "ready" : "pending"),
  }));
  const project = {
    id: uid("proj"),
    title:
      String(raw.title || "").trim() ||
      DEFAULT_PROJECT_TITLE,
    premise: String(raw.premise || "").trim(),
    style: String(raw.style || "").trim(),
    aspectRatio: raw.aspectRatio || "9:16",
    durationPerShot: clampShotDuration(raw.durationPerShot, 15),
    characters,
    shots,
    coverUrl: raw.coverUrl || undefined,
    studioMode: raw.studioMode === "board" ? "board" : "raw",
    studioCaches:
      raw.studioCaches && typeof raw.studioCaches === "object"
        ? raw.studioCaches
        : undefined,
    videoConversationId: raw.videoConversationId || undefined,
    videoConversationsByAccount:
      raw.videoConversationsByAccount &&
      typeof raw.videoConversationsByAccount === "object"
        ? raw.videoConversationsByAccount
        : undefined,
    createdAt: raw.createdAt || now,
    updatedAt: now,
  };
  return hydrateProjectMedia(project);
}

export async function readProjectPackFile() {
  const json = await importJsonFile();
  return parseProjectImportPack(json);
}

export async function importProjectFromFile() {
  const project = await readProjectPackFile();
  await saveProjectAsync(project);
  setActiveProjectId(project.id);
  return project;
}

export async function exportProjectById(id) {
  const list = loadProjects();
  const found = list.find((p) => p.id === id);
  if (!found) throw new Error("项目不存在");
  const hydrated = await hydrateProjectMedia(found);
  const pack = await buildProjectExportPack(hydrated);
  const name = `${hydrated.title || DEFAULT_PROJECT_TITLE}-项目包.json`;
  await downloadProjectPack(name, pack);
  return pack;
}

const ACCESS_SETTING_KEYS = [
  "useMock",
  "videoProvider",
  "autoFallback",
  "fallbackProviders",
  "jimengApiBase",
  "doubaoApiBase",
  "jimengProxyBase",
  "xyqProxyBase",
  "authProxyBase",
  "seedanceVariant",
  "seedanceMiniModel",
  "seedanceFastModel",
  "activeAccountId",
  "doubaoApiKey",
  "doubaoChatModel",
  "doubaoImageModel",
  "doubaoConversationId",
  "llmBaseUrl",
  "llmApiKey",
  "llmModel",
  "falKey",
  "imageModel",
  "apiBaseUrl",
];

const REGIONS = ["cn", "us", "hk", "jp", "sg"];

function platformLabelForPack(p) {
  if (p === "doubao") return "豆包";
  if (p === "jimeng") return "即梦";
  if (p === "xyq") return "小云雀";
  return "账号";
}

function normalizeAccount(raw) {
  const sessionId = String(raw?.sessionId || "").trim();
  if (!sessionId) return null;
  const platform =
    raw.platform === "doubao" ||
    raw.platform === "jimeng" ||
    raw.platform === "xyq" ||
    raw.platform === "any"
      ? raw.platform
      : "any";
  const region = REGIONS.includes(raw.region) ? raw.region : "cn";
  return {
    id: String(raw.id || "").trim() || uid("acc"),
    label: String(raw.label || "").trim() || platformLabelForPack(platform),
    sessionId,
    cookieHeader: raw.cookieHeader?.trim() || undefined,
    region,
    platform,
    phone: raw.phone?.trim() || undefined,
    loginAt: raw.loginAt || undefined,
    enabled: raw.enabled !== false,
    usedCount: typeof raw.usedCount === "number" ? raw.usedCount : 0,
    cooldownUntil: typeof raw.cooldownUntil === "number" ? raw.cooldownUntil : undefined,
    lastError: raw.lastError || undefined,
    conversationId: raw.conversationId?.trim() || undefined,
  };
}

function sliceSettings(s) {
  const out = {};
  for (const key of ACCESS_SETTING_KEYS) {
    if (key === "fallbackProviders") {
      out[key] = [...(s.fallbackProviders || [])];
    } else if (key === "activeAccountId" || key === "doubaoConversationId" || key === "apiBaseUrl") {
      out[key] = s[key] || "";
    } else if (key === "doubaoApiKey" || key === "llmApiKey" || key === "falKey") {
      out[key] = s[key] || "";
    } else {
      out[key] = s[key];
    }
  }
  return out;
}

function pickDefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function buildAccessPack(settings) {
  const accounts = (settings.jimengAccounts || [])
    .map((a) => normalizeAccount(a))
    .filter(Boolean);
  return {
    version: ACCESS_PACK_VERSION,
    kind: ACCESS_PACK_KIND,
    exportedAt: new Date().toISOString(),
    accounts,
    settings: sliceSettings(settings),
  };
}

/** 解析导入包：正式 pack / accounts / 旧 settings JSON / 纯账号数组 */
export function parseAccessPack(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("配置包格式无效");
  }
  const obj = raw;

  if (obj.kind === ACCESS_PACK_KIND || Array.isArray(obj.accounts)) {
    const list = Array.isArray(obj.accounts) ? obj.accounts : [];
    const accounts = list.map((item) => normalizeAccount(item || {})).filter(Boolean);
    if (!accounts.length && !obj.settings) {
      throw new Error("配置包里没有已登录账号");
    }
    const settings =
      obj.settings && typeof obj.settings === "object" ? obj.settings : {};
    return { accounts, settings };
  }

  if (Array.isArray(obj.jimengAccounts)) {
    const accounts = obj.jimengAccounts.map((item) => normalizeAccount(item || {})).filter(Boolean);
    const { jimengAccounts: _drop, ...rest } = obj;
    return { accounts, settings: rest };
  }

  if (Array.isArray(raw)) {
    const accounts = raw.map((item) => normalizeAccount(item || {})).filter(Boolean);
    if (!accounts.length) throw new Error("配置包里没有已登录账号");
    return { accounts, settings: {} };
  }

  throw new Error("无法识别的配置包格式");
}

export function mergeAccessPack(current, pack, mode = "merge") {
  const incoming = pack.accounts || [];
  let accounts;
  if (mode === "replace") {
    accounts = incoming;
  } else {
    const byKey = new Map();
    const keyOf = (a) => {
      if (a.phone?.trim()) return `${a.platform}:${a.phone.trim()}`;
      return `${a.platform}:sid:${a.sessionId.trim()}`;
    };
    for (const a of current.jimengAccounts || []) byKey.set(keyOf(a), a);
    for (const a of incoming) {
      const k = keyOf(a);
      const prev = byKey.get(k);
      byKey.set(
        k,
        prev
          ? {
              ...prev,
              ...a,
              id: prev.id,
              conversationId: a.conversationId || prev.conversationId,
            }
          : a,
      );
    }
    accounts = [...byKey.values()];
  }

  let next = {
    ...current,
    ...pickDefined(pack.settings || {}),
    jimengAccounts: accounts,
  };
  if (!next.doubaoApiBase) next.doubaoApiBase = DEFAULT_SETTINGS.doubaoApiBase;
  if (!next.jimengProxyBase) next.jimengProxyBase = DEFAULT_SETTINGS.jimengProxyBase;
  if (!next.xyqProxyBase) next.xyqProxyBase = DEFAULT_SETTINGS.xyqProxyBase;
  if (!Array.isArray(next.fallbackProviders)) next.fallbackProviders = [];

  const activeId =
    next.activeAccountId && accounts.some((a) => a.id === next.activeAccountId)
      ? next.activeAccountId
      : accounts[0]?.id || "";
  next = activeId
    ? withActiveAccount({ ...next, activeAccountId: activeId }, activeId)
    : { ...next, activeAccountId: "", doubaoConversationId: "" };
  return next;
}

export function isPortableMediaUrl(url) {
  return isPortableMediaUrlIdb(url);
}

function arrayBufferToBase64(buffer) {
  if (typeof uni !== "undefined" && typeof uni.arrayBufferToBase64 === "function") {
    return uni.arrayBufferToBase64(buffer);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === "function") return btoa(binary);
  throw new Error("无法编码媒体数据");
}

async function fetchAsDataUrl(url) {
  const absolute = absolutizeMaybe(url);
  try {
    // #ifdef H5
    if (typeof fetch === "function") {
      const res = await fetch(absolute);
      if (!res.ok) return undefined;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取媒体失败"));
        reader.readAsDataURL(blob);
      });
    }
    // #endif
    const data = await new Promise((resolve, reject) => {
      uni.request({
        url: absolute,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 60000,
        success: resolve,
        fail: reject,
      });
    });
    if (data.statusCode >= 400) return undefined;
    const mime =
      (data.header && (data.header["Content-Type"] || data.header["content-type"])) ||
      "application/octet-stream";
    const b64 = arrayBufferToBase64(data.data);
    return `data:${String(mime).split(";")[0]};base64,${b64}`;
  } catch {
    return undefined;
  }
}

function absolutizeMaybe(url) {
  if (!url) return url;
  if (/^(https?:|data:|blob:|file:|jingxu-media:)/i.test(url)) return url;
  // 本机临时媒体必须走当前页同源，不能拼到豆包 mediaBase
  if (/\/(?:api\/)?tmp-media\//i.test(url) || url.startsWith("/")) {
    // #ifdef H5
    if (typeof location !== "undefined" && location.origin) {
      return `${location.origin}${url.startsWith("/") ? url : `/${url}`}`;
    }
    // #endif
  }
  const ep = resolveEndpoints();
  const base = String(resolveApiBase() || ep.mediaBase || "").replace(/\/+$/, "");
  if (!base) return url;
  if (url.startsWith("/api/tmp-media/")) return `${base}${url.replace(/^\/api/, "")}`;
  if (url.startsWith(UPSTREAM_PATHS.tmpMediaPrefix)) return `${base}${url}`;
  if (url.startsWith("/")) return `${base}${url.replace(/^\/api/, "")}`;
  return url;
}

/** 导出/落库前把角色图落实为可携带的 data/http URL（对齐网页 toPersistentMediaUrl） */
export async function toPersistentMediaUrl(url) {
  if (isMediaRef(url) || isEphemeralMediaUrl(url) || isPortableMediaUrlIdb(url) || (url && url.startsWith("/"))) {
    return toPersistentMediaUrlIdb(url);
  }
  if (!url) return undefined;
  if (String(url).startsWith("data:")) return isPortableMediaUrl(url) ? url : undefined;
  if (/^https?:\/\//i.test(url)) {
    const embedded = await fetchAsDataUrl(url);
    return embedded || url;
  }
  return undefined;
}

export async function repairCharacterImages(characters) {
  const out = [];
  let ok = 0;
  let lost = 0;
  for (const c of characters || []) {
    const had = Boolean(c.threeViewUrl || c.referenceImageUrl);
    const next = await materializeCharacterImages(c);
    const has = Boolean(next.threeViewUrl || next.referenceImageUrl);
    if (has) ok += 1;
    else if (had) lost += 1;
    out.push(next);
  }
  return { characters: out, ok, lost };
}

function waitVideoEvent(target, type, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待 ${type} 超时`));
    }, timeoutMs);
    const onOk = (ev) => {
      cleanup();
      resolve(ev);
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`视频事件失败: ${type}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(type, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(type, onOk);
    target.addEventListener("error", onErr);
  });
}

/** 与网页 extractLastFrameFromVideo 一致：截视频尾帧为 JPEG data URL */
export async function extractLastFrameFromVideo(videoUrl) {
  if (typeof document === "undefined") {
    throw new Error("当前环境无法截取视频画面");
  }
  const src = String(videoUrl || "").trim();
  if (!src) throw new Error("请填写视频链接");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const absoluteHttp = /^https?:\/\//i.test(src);
  const sameOrigin =
    absoluteHttp &&
    typeof window !== "undefined" &&
    src.startsWith(window.location.origin);
  if (absoluteHttp && !sameOrigin) video.crossOrigin = "anonymous";
  try {
    video.src = src;
    video.load();
    await Promise.race([
      waitVideoEvent(video, "loadedmetadata", 20000),
      waitVideoEvent(video, "loadeddata", 20000),
    ]).catch(() => {
      throw new Error("视频加载失败（链接无效、需登录或格式不支持）");
    });
    let duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        await video.play();
        video.pause();
      } catch {
        /* ignore */
      }
      duration = video.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("无法读取视频时长");
    }
    const targets = [0.12, 0.35, 0.8, 1.5].map((o) => Math.max(0, duration - o));
    const canvas = document.createElement("canvas");
    let fallback = "";
    for (const t of targets) {
      video.currentTime = t;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2500);
        video.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      if (!video.videoWidth) continue;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(video, 0, 0);
      let dataUrl = "";
      try {
        dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      } catch {
        continue;
      }
      if (dataUrl && dataUrl.length > 100) {
        if (!fallback) fallback = dataUrl;
        return dataUrl;
      }
    }
    if (fallback) return fallback;
    throw new Error("截取尾帧失败");
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* ignore */
    }
  }
}

export async function materializeCharacterImages(c) {
  const three = await toPersistentMediaUrl(c.threeViewUrl);
  const ref = await toPersistentMediaUrl(c.referenceImageUrl);
  return {
    ...c,
    threeViewUrl: three,
    referenceImageUrl: ref || three,
  };
}

export async function buildCharacterPack(characters, title) {
  const list = [];
  for (const c of characters || []) {
    list.push(
      await materializeCharacterImages({
        id: c.id || uid("char"),
        name: c.name,
        appearance: c.appearance,
        locked: c.locked ?? true,
        threeViewUrl: c.threeViewUrl,
        referenceImageUrl: c.referenceImageUrl,
      }),
    );
  }
  return {
    version: CHARACTER_PACK_VERSION,
    kind: CHARACTER_PACK_KIND,
    exportedAt: new Date().toISOString(),
    title,
    characters: list,
  };
}

export function parseCharacterPack(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("角色包格式无效");
  }
  const list = Array.isArray(raw.characters)
    ? raw.characters
    : Array.isArray(raw)
      ? raw
      : null;
  if (!list?.length) throw new Error("角色包里没有角色");
  return list.map((item) => {
    const c = item || {};
    const name = (c.name || "").trim() || "角色";
    const three = typeof c.threeViewUrl === "string" ? c.threeViewUrl : undefined;
    const ref = typeof c.referenceImageUrl === "string" ? c.referenceImageUrl : undefined;
    return {
      id: uid("char"),
      name,
      appearance: c.appearance || "",
      locked: c.locked ?? true,
      threeViewUrl: three,
      referenceImageUrl: ref || three,
    };
  });
}

function characterNameKey(name) {
  return (name || "").trim().toLowerCase();
}

function pickImageUrl(preferred, ...fallbacks) {
  if (isPortableMediaUrl(preferred)) return preferred;
  for (const u of fallbacks) {
    if (isPortableMediaUrl(u)) return u;
  }
  if (preferred) return preferred;
  for (const u of fallbacks) {
    if (u) return u;
  }
  return undefined;
}

/** 按名称合并角色（与网页 mergeCharactersByName 一致） */
export function mergeCharactersByName(current, incoming) {
  const byName = new Map();
  for (const c of current) {
    const key = characterNameKey(c.name || "");
    if (!key) continue;
    byName.set(key, c);
  }
  let replaced = 0;
  let added = 0;
  for (const inc of incoming) {
    const key = characterNameKey(inc.name || "");
    if (!key) continue;
    const prev = byName.get(key);
    if (prev) {
      const three = pickImageUrl(
        isPortableMediaUrl(inc.threeViewUrl) ? inc.threeViewUrl : undefined,
        isPortableMediaUrl(inc.referenceImageUrl) ? inc.referenceImageUrl : undefined,
        prev.threeViewUrl,
        prev.referenceImageUrl,
      );
      const ref = pickImageUrl(
        isPortableMediaUrl(inc.referenceImageUrl) ? inc.referenceImageUrl : undefined,
        three,
        prev.referenceImageUrl,
        prev.threeViewUrl,
      );
      byName.set(key, {
        ...prev,
        ...inc,
        id: prev.id || inc.id || uid("char"),
        name: inc.name.trim() || prev.name,
        threeViewUrl: three,
        referenceImageUrl: ref,
        locked: inc.locked ?? prev.locked ?? true,
      });
      replaced += 1;
    } else {
      byName.set(key, {
        ...inc,
        id: inc.id || uid("char"),
        name: inc.name.trim() || "角色",
        threeViewUrl: isPortableMediaUrl(inc.threeViewUrl) ? inc.threeViewUrl : undefined,
        referenceImageUrl: isPortableMediaUrl(inc.referenceImageUrl)
          ? inc.referenceImageUrl
          : isPortableMediaUrl(inc.threeViewUrl)
            ? inc.threeViewUrl
            : undefined,
      });
      added += 1;
    }
  }
  const seen = new Set();
  const out = [];
  for (const c of current) {
    const key = characterNameKey(c.name || "");
    if (!key || seen.has(key)) continue;
    const merged = byName.get(key);
    if (merged) {
      out.push(merged);
      seen.add(key);
    }
  }
  for (const inc of incoming) {
    const key = characterNameKey(inc.name || "");
    if (!key || seen.has(key)) continue;
    const merged = byName.get(key);
    if (merged) {
      out.push(merged);
      seen.add(key);
    }
  }
  const kept = current.filter((c) => {
    const key = characterNameKey(c.name || "");
    return key && !incoming.some((i) => characterNameKey(i.name || "") === key);
  }).length;
  return { characters: out, replaced, added, kept };
}

/**
 * @param {string} filename
 * @param {unknown} data
 * @param {{ pretty?: boolean }} [opts] pretty 默认 true；角色包网页版为 compact
 */
export function exportJsonFile(filename, data, opts = {}) {
  const pretty = opts.pretty !== false;
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const name = filename.endsWith(".json") ? filename : `${filename}.json`;
  // #ifdef H5
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return Promise.resolve(name);
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => {
    const path = `${uni.env.USER_DATA_PATH}/${name}`;
    uni.getFileSystemManager().writeFile({
      filePath: path,
      data: text,
      encoding: "utf8",
      success() {
        uni.openDocument({
          filePath: path,
          showMenu: true,
          fail() {
            uni.showModal({ title: "已保存", content: path, showCancel: false });
          },
        });
        resolve(path);
      },
      fail(err) {
        reject(new Error(err?.errMsg || "导出失败"));
      },
    });
  });
  // #endif
}

export function downloadAccessPack(filename, pack) {
  return exportJsonFile(filename, pack, { pretty: true });
}

export function downloadCharacterPack(filename, pack) {
  return exportJsonFile(filename, pack, { pretty: false });
}

export function downloadJson(filename, data) {
  return exportJsonFile(filename, data, { pretty: true });
}

export function importJsonFile() {
  return new Promise((resolve, reject) => {
    const done = (text) => {
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("JSON 无法解析"));
      }
    };
    // #ifdef H5
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("已取消"));
        return;
      }
      file.text().then(done).catch(() => reject(new Error("读取失败")));
    };
    input.click();
    // #endif
    // #ifndef H5
    uni.chooseFile({
      count: 1,
      extension: [".json"],
      success(res) {
        const path = res.tempFiles?.[0]?.path || res.tempFilePaths?.[0];
        if (!path) {
          reject(new Error("未选择文件"));
          return;
        }
        uni.getFileSystemManager().readFile({
          filePath: path,
          encoding: "utf8",
          success(r) {
            done(String(r.data || ""));
          },
          fail() {
            reject(new Error("读取文件失败"));
          },
        });
      },
      fail() {
        reject(new Error("已取消选择"));
      },
    });
    // #endif
  });
}

export async function readAccessPackFile() {
  const json = await importJsonFile();
  return parseAccessPack(json);
}

export async function readCharacterPackFile() {
  const json = await importJsonFile();
  const parsed = parseCharacterPack(json);
  const out = [];
  for (const c of parsed) {
    out.push(await materializeCharacterImages(c));
  }
  return out;
}

/** 与网页 StudioWorkspace.exportStoryboard 字段一致 */
export function buildStoryboardExport(project, stylePreset) {
  const activeStyle = stylePreset || project.style;
  const frameRatio = project.aspectRatio;
  return {
    title: project.title,
    premise: project.premise,
    aspectRatio: project.aspectRatio,
    durationPerShot: project.durationPerShot,
    characters: project.characters,
    shots: (project.shots || []).map((s) => ({
      index: s.index + 1,
      scene: s.scene,
      locationName: s.locationName,
      placeIntro: s.placeIntro,
      characterIntros: s.characterIntros,
      lines: s.lines,
      dialogue: s.dialogue,
      camera: s.camera,
      storyboardPrompt: s.storyboardPrompt,
      composedPrompt: composeVideoPrompt(s, activeStyle, frameRatio),
      imagePrompt: s.imagePrompt,
      videoUrl: s.videoUrl,
    })),
  };
}

export function extractSessionId(raw) {
  const t = (raw || "").trim();
  if (!t) return "";
  const m = t.match(/(?:^|[;\s])sessionid(?:_ss)?=([^;\s]+)/i);
  if (m?.[1]) return m[1].trim();
  if (!/[=;\s]/.test(t) && t.length >= 16) return t;
  return t.replace(/^sessionid(?:_ss)?=/i, "").split(/[;\s]/)[0].trim();
}

export function extractCookieHeader(raw, sessionId) {
  const t = (raw || "").trim();
  if (!t.includes("=")) return "";
  // 整段 Cookie（含分号）优先
  if (/;/.test(t) && /sessionid/i.test(t)) {
    if (!/(?:^|[;\s])sessionid=/i.test(t) && sessionId) {
      return `sessionid=${sessionId}; sessionid_ss=${sessionId}; ${t}`;
    }
    return t;
  }
  // 仅 sessionid=xxx：也写入 cookieHeader，便于下游统一取 Cookie 字段
  if (/^sessionid(?:_ss)?=/i.test(t) && sessionId) {
    return `sessionid=${sessionId}; sessionid_ss=${sessionId}`;
  }
  return "";
}

/** 是否具备出片更稳的整段 Cookie（ttwid / msToken 等），而非仅 sessionid */
export function accountHasFullCookie(account) {
  const c = String(account?.cookieHeader || "").trim();
  if (!c || !c.includes(";")) return false;
  if (/ttwid|msToken|passport_csrf|sid_tt|odin_tt|sid_guard/i.test(c)) return true;
  const parts = c.split(";").map((s) => s.trim()).filter(Boolean);
  return parts.length >= 3;
}

export function downloadShotVideo(shot) {
  const url = shot?.videoUrl;
  if (!url) return Promise.reject(new Error("没有视频"));
  const name = `镜${(shot.index ?? 0) + 1}-${(shot.scene || "shot").slice(0, 18)}.mp4`.replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  // #ifdef H5
  if (url.startsWith("data:") || /^https?:/i.test(url)) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.target = "_blank";
    a.click();
    return Promise.resolve(name);
  }
  // #endif
  // #ifndef H5
  const fsm = uni.getFileSystemManager();
  const path = `${uni.env.USER_DATA_PATH}/${name}`;
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1] || "";
    return new Promise((resolve, reject) => {
      fsm.writeFile({
        filePath: path,
        data: b64,
        encoding: "base64",
        success() {
          uni.saveVideoToPhotosAlbum({
            filePath: path,
            success: () => resolve(path),
            fail: () => {
              uni.openDocument({ filePath: path, showMenu: true });
              resolve(path);
            },
          });
        },
        fail: (err) => reject(new Error(err?.errMsg || "保存视频失败")),
      });
    });
  }
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 400 || !res.tempFilePath) {
          reject(new Error(`下载失败 HTTP ${res.statusCode || ""}`));
          return;
        }
        uni.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => resolve(res.tempFilePath),
          fail: () => {
            uni.openDocument({ filePath: res.tempFilePath, showMenu: true });
            resolve(res.tempFilePath);
          },
        });
      },
      fail: (err) => reject(new Error(err?.errMsg || "下载失败")),
    });
  });
  // #endif
  return Promise.reject(new Error("无法下载该视频"));
}

export function toastErr(e, fallback) {
  const msg = e instanceof Error ? e.message : fallback || "操作失败";
  uni.showToast({ title: msg.slice(0, 36), icon: "none", duration: 2800 });
  return msg;
}
