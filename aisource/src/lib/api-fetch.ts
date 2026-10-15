import { IS_STATIC_HTML } from "./is-static";
import { handleStaticApi } from "./browser-api";
import {
  ENDPOINT_DEFAULT_PATH,
  REQUEST_PATH_TO_ENDPOINT,
  UPSTREAM_PATHS,
  type UpstreamEndpointKey,
} from "./upstream-paths";

const SETTINGS_KEY = "jingxu-settings";

/** 静态包可配置的原接口（完整 HTTPS URL，路径对齐上游，不要带本项目的 /api 业务前缀） */
export type JingxuEndpoints = Partial<
  Record<UpstreamEndpointKey, string>
>;

declare global {
  interface Window {
    /** 在线服务根地址；请求自动拼上游原路径 */
    __JINGXU_API_BASE__?: string;
    /** 逐项完整原 URL，优先于 API_BASE */
    __JINGXU_ENDPOINTS__?: JingxuEndpoints;
  }
}

/** 解析 HTTPS 服务根（不含末尾 /） */
export function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const fromWindow = window.__JINGXU_API_BASE__?.trim();
    if (fromWindow) return fromWindow.replace(/\/+$/, "");
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { apiBaseUrl?: string };
        const fromSettings = parsed.apiBaseUrl?.trim();
        if (fromSettings) return fromSettings.replace(/\/+$/, "");
      }
    } catch {
      /* ignore */
    }
  }
  const fromEnv = (process.env.NEXT_PUBLIC_API_BASE || "").trim();
  return fromEnv.replace(/\/+$/, "");
}

function resolveEndpoints(): JingxuEndpoints {
  if (typeof window === "undefined") return {};
  return window.__JINGXU_ENDPOINTS__ || {};
}

/** 是否已配置可请求的原线上 HTTPS 接口 */
export function hasOnlineEndpoints(): boolean {
  if (resolveApiBase()) return true;
  const ep = resolveEndpoints();
  return Object.values(ep).some(
    (v) => typeof v === "string" && /^https?:\/\//i.test(v.trim()),
  );
}

function normalizePathKey(path: string): string {
  const clean = path.split("?")[0] || path;
  if (clean.length > 1 && clean.endsWith("/")) return clean;
  return clean.replace(/\/$/, "") || "/";
}

/**
 * 静态包：内部 path → 上游原 URL
 * - __JINGXU_ENDPOINTS__ 逐项完整地址优先
 * - 否则 {API_BASE} + 上游原路径（如 /samantha/chat/completion）
 */
export function resolveStaticRequestUrl(path: string): string | null {
  const clean = normalizePathKey(path);
  const ep = resolveEndpoints();
  const key =
    REQUEST_PATH_TO_ENDPOINT[clean] ||
    REQUEST_PATH_TO_ENDPOINT[`${clean}/`];

  if (key && key !== "mediaBase") {
    const full = ep[key]?.trim();
    if (full) return full;

    const base = resolveApiBase();
    if (base) {
      const suffix = ENDPOINT_DEFAULT_PATH[key];
      return `${base}${suffix}`;
    }
  }

  // 仅本机 Next 实现：不得拼到上游（否则会 502）
  if (
    clean === "/api/frame-from-video" ||
    clean === "/frame-from-video" ||
    clean.startsWith("/api/frame-from-video?")
  ) {
    return null;
  }

  const base = resolveApiBase();
  if (!base) return null;

  // 已是上游原路径则原样拼接；旧 /api/* 剥掉后按上游表映射
  if (clean.startsWith("/api/script")) {
    return `${base}${UPSTREAM_PATHS.script}`;
  }
  if (clean.startsWith("/api/image")) {
    return `${base}${UPSTREAM_PATHS.image}`;
  }
  // 注意：必须精确匹配 /api/video，避免误伤 /api/frame-from-video
  if (
    clean === "/api/video" ||
    clean.startsWith("/api/video?") ||
    clean.startsWith("/api/video/")
  ) {
    return `${base}${UPSTREAM_PATHS.video}`;
  }
  if (clean.startsWith("/api/enrich")) {
    return `${base}${UPSTREAM_PATHS.enrich}`;
  }
  if (clean.startsWith("/api/chat-reply")) {
    return `${base}${UPSTREAM_PATHS.chatReply}`;
  }
  if (clean.startsWith("/api/auth/send-code")) {
    return `${base}${UPSTREAM_PATHS.authSendCode}`;
  }
  if (clean.startsWith("/api/auth/login")) {
    return `${base}${UPSTREAM_PATHS.authLogin}`;
  }
  if (clean.startsWith("/api/auth/check-session")) {
    return `${base}${UPSTREAM_PATHS.authCheckSession}`;
  }
  if (clean.startsWith("/api/tmp-media/")) {
    return `${base}${clean.replace(/^\/api/, "")}`;
  }

  const stripped = clean.replace(/^\/api(?=\/|$)/, "") || "/";
  return `${base}${stripped.startsWith("/") ? stripped : `/${stripped}`}`;
}

/** 把响应里的相对媒体路径补成可访问的原地址（静态站） */
export function absolutizeMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:|jingxu-media:)/i.test(url)) return url;

  const ep = resolveEndpoints();
  const mediaBase = (ep.mediaBase || resolveApiBase() || "").replace(/\/+$/, "");
  if (!mediaBase) return url;

  if (url.startsWith("/api/tmp-media/")) {
    return `${mediaBase}${url.replace(/^\/api/, "")}`;
  }
  if (url.startsWith(UPSTREAM_PATHS.tmpMediaPrefix)) {
    return `${mediaBase}${url}`;
  }
  if (url.startsWith("/")) {
    return `${mediaBase}${url.replace(/^\/api/, "")}`;
  }
  return url;
}

/**
 * 统一请求：
 * - 静态包：上游原 URL（endpoints 或 base + 原路径）；未配置则本地演示
 * - Next 同源：仍走内部 /api/*（rewrite 已挂上游原路径）
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiPath = path.startsWith("/") ? path : `/${path}`;

  if (IS_STATIC_HTML) {
    const target = resolveStaticRequestUrl(apiPath);
    if (target) {
      return fetch(target, {
        ...init,
        headers: {
          ...(init?.headers || {}),
        },
      });
    }
    return handleStaticApi(apiPath, init);
  }

  const base = resolveApiBase();
  if (base) {
    const target = resolveStaticRequestUrl(apiPath);
    if (target) return fetch(target, init);
  }

  return fetch(apiPath, init);
}
