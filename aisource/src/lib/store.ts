import type { ApiSettings, DramaProject } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { hasAnyLoggedInQuota } from "./auth";
import {
  persistAccountConversationId,
  resolveActiveAccountId,
  resolveSelectedAccount,
} from "./doubao-session";
import {
  collectMediaRefs,
  dehydrateProjectMedia,
  deleteMedia,
  hydrateProjectMedia,
} from "./media-db";
export { uid } from "./id";

const SETTINGS_KEY = "jingxu-settings";
const PROJECTS_KEY = "jingxu-projects";
const ACTIVE_PROJECT_KEY = "jingxu-active-project";
/** 一次性把旧「默认 Mock」迁到在线版 */
const ONLINE_DEFAULT_FLAG = "jingxu-online-default-v1";

export function loadSettings(): ApiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ApiSettings>;
    const jimengAccounts = Array.isArray(parsed.jimengAccounts)
      ? parsed.jimengAccounts.map((a) => {
          const { cooldownUntil: _drop, ...rest } = a as typeof a & {
            cooldownUntil?: number;
          };
          return {
            ...rest,
            platform: a.platform || "any",
            cooldownUntil: undefined,
          };
        })
      : [];
    const merged: ApiSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      jimengAccounts,
      activeAccountId:
        typeof parsed.activeAccountId === "string"
          ? parsed.activeAccountId
          : "",
      // 保留已保存的方舟 Key（导入/导出配置需要）
      doubaoApiKey:
        typeof parsed.doubaoApiKey === "string" ? parsed.doubaoApiKey : "",
      autoFallback:
        typeof parsed.autoFallback === "boolean"
          ? parsed.autoFallback
          : DEFAULT_SETTINGS.autoFallback,
      fallbackProviders: Array.isArray(parsed.fallbackProviders)
        ? parsed.fallbackProviders
        : DEFAULT_SETTINGS.fallbackProviders,
      doubaoApiBase:
        parsed.doubaoApiBase || DEFAULT_SETTINGS.doubaoApiBase,
      jimengProxyBase:
        parsed.jimengProxyBase || DEFAULT_SETTINGS.jimengProxyBase,
      xyqProxyBase: parsed.xyqProxyBase || DEFAULT_SETTINGS.xyqProxyBase,
      authProxyBase:
        typeof parsed.authProxyBase === "string"
          ? parsed.authProxyBase
          : DEFAULT_SETTINGS.authProxyBase,
      doubaoChatModel:
        parsed.doubaoChatModel || DEFAULT_SETTINGS.doubaoChatModel,
      doubaoImageModel:
        !parsed.doubaoImageModel ||
        parsed.doubaoImageModel === "doubao-web-image" ||
        parsed.doubaoImageModel.includes("seed-vision") ||
        parsed.doubaoImageModel.includes("seedream-4-0")
          ? DEFAULT_SETTINGS.doubaoImageModel
          : parsed.doubaoImageModel,
      imageModel:
        !parsed.imageModel ||
        parsed.imageModel === "doubao-web-image" ||
        parsed.imageModel.includes("seedream-4-0")
          ? DEFAULT_SETTINGS.imageModel
          : parsed.imageModel,
    };
    // 校正当前账号：缺失或已删除时回落到第一个可用账号
    const resolvedActive = resolveActiveAccountId(merged);
    merged.activeAccountId = resolvedActive || "";

    // 旧版全局对话 id 迁到当前豆包账号；并镜像账号上的对话窗
    const activeAcc = resolveSelectedAccount(merged);
    if (
      activeAcc?.platform === "doubao" &&
      !activeAcc.conversationId?.trim() &&
      merged.doubaoConversationId?.trim()
    ) {
      Object.assign(
        merged,
        persistAccountConversationId(
          merged,
          merged.doubaoConversationId,
          activeAcc.id,
        ),
      );
    } else if (activeAcc?.conversationId?.trim()) {
      merged.doubaoConversationId = activeAcc.conversationId.trim();
    }

    // 当前选用豆包账号时，主通道强制线上豆包（本机无需 :5100 代理）
    const activeIsDoubao =
      activeAcc?.enabled &&
      activeAcc.platform === "doubao" &&
      Boolean(activeAcc.sessionId?.trim());
    if (activeIsDoubao) {
      merged.videoProvider = "doubao";
      merged.jimengApiBase =
        merged.doubaoApiBase || DEFAULT_SETTINGS.doubaoApiBase;
      merged.seedanceMiniModel = DEFAULT_SETTINGS.seedanceMiniModel;
      merged.seedanceFastModel = DEFAULT_SETTINGS.seedanceFastModel;
      // 本机仅前端：关闭对本地代理的自动回退
      merged.autoFallback = false;
      merged.fallbackProviders = [];
    }

    // 默认在线版：旧数据若仍停留在 Mock，一次性切到线上
    if (!localStorage.getItem(ONLINE_DEFAULT_FLAG)) {
      merged.useMock = false;
      localStorage.setItem(ONLINE_DEFAULT_FLAG, "1");
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      } catch {
        /* ignore quota */
      }
    } else if (
      hasAnyLoggedInQuota(merged.jimengAccounts) &&
      typeof parsed.useMock !== "boolean"
    ) {
      merged.useMock = false;
    }
    if (
      !merged.jimengApiBase ||
      merged.jimengApiBase.includes("localhost") ||
      (merged.jimengApiBase.includes("127.0.0.1") &&
        merged.videoProvider === "doubao" &&
        !merged.jimengApiBase.includes("5100") &&
        !merged.jimengApiBase.includes("5200"))
    ) {
      if (merged.videoProvider === "xyq") {
        merged.jimengApiBase = merged.xyqProxyBase;
      } else if (merged.videoProvider === "jimeng") {
        merged.jimengApiBase = merged.jimengProxyBase;
      } else {
        merged.videoProvider = "doubao";
        merged.jimengApiBase = merged.doubaoApiBase;
        merged.seedanceMiniModel = DEFAULT_SETTINGS.seedanceMiniModel;
        merged.seedanceFastModel = DEFAULT_SETTINGS.seedanceFastModel;
      }
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ApiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** 原始列表（可能含 jingxu-media: 引用，未 hydrate） */
export function loadProjectsRaw(): DramaProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    // 异常截断的巨型 JSON（历史 data URL）会导致 Unterminated string
    if (raw.length > 4_500_000) {
      console.warn(
        "[jingxu] jingxu-projects 过大，已备份并清空以免 Unterminated string",
      );
      try {
        localStorage.setItem(
          `${PROJECTS_KEY}-broken-backup`,
          raw.slice(0, 200_000),
        );
      } catch {
        /* ignore */
      }
      localStorage.removeItem(PROJECTS_KEY);
      return [];
    }
    return JSON.parse(raw) as DramaProject[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    console.warn("[jingxu] 项目列表 JSON 损坏，已清空", msg);
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (raw) {
        localStorage.setItem(
          `${PROJECTS_KEY}-broken-backup`,
          raw.slice(0, 200_000),
        );
      }
      localStorage.removeItem(PROJECTS_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

export function loadProjects(): DramaProject[] {
  return loadProjectsRaw();
}

export function loadProject(id: string): DramaProject | null {
  return loadProjectsRaw().find((p) => p.id === id) || null;
}

function writeProjectsList(projects: DramaProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 40)));
}

/**
 * 持久化项目：大图进 IndexedDB，localStorage 只存引用，避免 QuotaExceededError
 */
export async function saveProject(project: DramaProject) {
  const slim = await dehydrateProjectMedia(project);
  const projects = loadProjectsRaw().filter((p) => p.id !== slim.id);
  projects.unshift(slim);

  const tryWrite = (list: DramaProject[]) => {
    writeProjectsList(list);
  };

  try {
    tryWrite(projects);
  } catch (e) {
    const isQuota =
      e instanceof DOMException &&
      (e.name === "QuotaExceededError" || e.code === 22);
    if (!isQuota) throw e;

    // 配额仍满：丢掉最旧项目的媒体与条目后重试
    const trimmed = [...projects];
    while (trimmed.length > 1) {
      const dropped = trimmed.pop();
      if (dropped) {
        const refs = await collectMediaRefs(dropped);
        await Promise.all(refs.map((r) => deleteMedia(r)));
      }
      try {
        tryWrite(trimmed);
        setActiveProjectId(slim.id);
        return;
      } catch (e2) {
        const stillQuota =
          e2 instanceof DOMException &&
          (e2.name === "QuotaExceededError" || e2.code === 22);
        if (!stillQuota) throw e2;
      }
    }

    // 最后手段：当前项目也去掉媒体字段再存元数据
    const tiny: DramaProject = {
      ...slim,
      coverUrl: undefined,
      characters: slim.characters.map((c) => ({
        ...c,
        referenceImageUrl: undefined,
        threeViewUrl: undefined,
      })),
      shots: slim.shots.map((s) => ({
        ...s,
        sceneImageUrl: undefined,
        imageUrl: undefined,
        lastFrameUrl: undefined,
        videoUrl: undefined,
      })),
    };
    tryWrite([tiny]);
  }

  setActiveProjectId(slim.id);
}

export async function deleteProject(id: string) {
  const existing = loadProjectsRaw().find((p) => p.id === id);
  if (existing) {
    const refs = await collectMediaRefs(existing);
    await Promise.all(refs.map((r) => deleteMedia(r)));
  }
  const projects = loadProjectsRaw().filter((p) => p.id !== id);
  writeProjectsList(projects);
  if (getActiveProjectId() === id) {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
}

export function setActiveProjectId(id: string | null) {
  if (!id) {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_PROJECT_KEY, id);
}

export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function loadActiveProject(): DramaProject | null {
  const id = getActiveProjectId();
  if (!id) return null;
  return loadProject(id);
}

/** 加载并还原媒体（供 UI 使用） */
export async function loadProjectHydrated(
  id: string,
): Promise<DramaProject | null> {
  const p = loadProject(id);
  if (!p) return null;
  return hydrateProjectMedia(p);
}

export async function loadActiveProjectHydrated(): Promise<DramaProject | null> {
  const id = getActiveProjectId();
  if (!id) return null;
  return loadProjectHydrated(id);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 清理历史上已写入 localStorage 的巨型 data URL（一次性迁移） */
export async function migrateProjectsOffLocalStorage() {
  const raw = loadProjectsRaw();
  if (!raw.length) return;
  let hasFat = false;
  try {
    // 避免对超大对象整表 stringify 卡死；抽样检查
    hasFat = raw.some((p) => {
      const probe = [
        p.coverUrl,
        ...p.characters.flatMap((c) => [c.threeViewUrl, c.referenceImageUrl]),
        ...p.shots.flatMap((s) => [
          s.sceneImageUrl,
          s.imageUrl,
          s.lastFrameUrl,
          s.videoUrl,
        ]),
      ];
      return probe.some((u) => typeof u === "string" && u.startsWith("data:"));
    });
  } catch {
    hasFat = true;
  }
  if (!hasFat) return;
  const slimList: DramaProject[] = [];
  for (const p of raw) {
    slimList.push(await dehydrateProjectMedia(p));
  }
  try {
    writeProjectsList(slimList);
  } catch {
    // 逐个写入
    for (let i = 0; i < slimList.length; i++) {
      try {
        writeProjectsList(slimList.slice(0, i + 1));
      } catch {
        writeProjectsList(slimList.slice(0, i));
        break;
      }
    }
  }
}
