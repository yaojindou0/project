import { uid } from "./id";
import { withActiveAccount } from "./doubao-session";
import type { ApiSettings, JimengAccount, JimengRegion } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export const ACCESS_PACK_KIND = "jingxu-access";
export const ACCESS_PACK_VERSION = 1;

/** 随账号一起迁移的接入相关字段 */
export type AccessSettingsSlice = Pick<
  ApiSettings,
  | "useMock"
  | "videoProvider"
  | "autoFallback"
  | "fallbackProviders"
  | "jimengApiBase"
  | "doubaoApiBase"
  | "jimengProxyBase"
  | "xyqProxyBase"
  | "authProxyBase"
  | "seedanceVariant"
  | "seedanceMiniModel"
  | "seedanceFastModel"
  | "activeAccountId"
  | "doubaoApiKey"
  | "doubaoChatModel"
  | "doubaoImageModel"
  | "doubaoConversationId"
  | "llmBaseUrl"
  | "llmApiKey"
  | "llmModel"
  | "falKey"
  | "imageModel"
  | "apiBaseUrl"
>;

export type AccessPack = {
  version: number;
  kind: typeof ACCESS_PACK_KIND;
  exportedAt: string;
  /** 已登录额度账号（含 session / Cookie） */
  accounts: JimengAccount[];
  /** 接入设置（通道、Key、代理等） */
  settings: AccessSettingsSlice;
};

const REGIONS: JimengRegion[] = ["cn", "us", "hk", "jp", "sg"];

function normalizeAccount(raw: Partial<JimengAccount>): JimengAccount | null {
  const sessionId = String(raw.sessionId || "").trim();
  if (!sessionId) return null;
  const platform =
    raw.platform === "doubao" ||
    raw.platform === "jimeng" ||
    raw.platform === "xyq" ||
    raw.platform === "any"
      ? raw.platform
      : "any";
  const region = REGIONS.includes(raw.region as JimengRegion)
    ? (raw.region as JimengRegion)
    : "cn";
  return {
    id: String(raw.id || "").trim() || uid("acc"),
    label: String(raw.label || "").trim() || platformLabel(platform),
    sessionId,
    cookieHeader: raw.cookieHeader?.trim() || undefined,
    region,
    platform,
    phone: raw.phone?.trim() || undefined,
    loginAt: raw.loginAt || undefined,
    enabled: raw.enabled !== false,
    usedCount: typeof raw.usedCount === "number" ? raw.usedCount : 0,
    cooldownUntil:
      typeof raw.cooldownUntil === "number" ? raw.cooldownUntil : undefined,
    lastError: raw.lastError || undefined,
    conversationId: raw.conversationId?.trim() || undefined,
  };
}

function platformLabel(p: JimengAccount["platform"]) {
  if (p === "doubao") return "豆包";
  if (p === "jimeng") return "即梦";
  if (p === "xyq") return "小云雀";
  return "账号";
}

function sliceSettings(s: ApiSettings): AccessSettingsSlice {
  return {
    useMock: s.useMock,
    videoProvider: s.videoProvider,
    autoFallback: s.autoFallback,
    fallbackProviders: [...(s.fallbackProviders || [])],
    jimengApiBase: s.jimengApiBase,
    doubaoApiBase: s.doubaoApiBase,
    jimengProxyBase: s.jimengProxyBase,
    xyqProxyBase: s.xyqProxyBase,
    authProxyBase: s.authProxyBase,
    seedanceVariant: s.seedanceVariant,
    seedanceMiniModel: s.seedanceMiniModel,
    seedanceFastModel: s.seedanceFastModel,
    activeAccountId: s.activeAccountId || "",
    doubaoApiKey: s.doubaoApiKey || "",
    doubaoChatModel: s.doubaoChatModel,
    doubaoImageModel: s.doubaoImageModel,
    doubaoConversationId: s.doubaoConversationId || "",
    llmBaseUrl: s.llmBaseUrl,
    llmApiKey: s.llmApiKey || "",
    llmModel: s.llmModel,
    falKey: s.falKey || "",
    imageModel: s.imageModel,
    apiBaseUrl: s.apiBaseUrl || "",
  };
}

export function buildAccessPack(settings: ApiSettings): AccessPack {
  const accounts = settings.jimengAccounts
    .map((a) => normalizeAccount(a))
    .filter((a): a is JimengAccount => Boolean(a));
  return {
    version: ACCESS_PACK_VERSION,
    kind: ACCESS_PACK_KIND,
    exportedAt: new Date().toISOString(),
    accounts,
    settings: sliceSettings(settings),
  };
}

export type ParsedAccessPack = {
  accounts: JimengAccount[];
  settings: Partial<AccessSettingsSlice>;
};

/** 解析导入包：支持正式 pack，或仅 accounts 数组 / 旧 settings JSON */
export function parseAccessPack(raw: unknown): ParsedAccessPack {
  if (!raw || typeof raw !== "object") {
    throw new Error("配置包格式无效");
  }
  const obj = raw as Record<string, unknown>;

  // 正式 pack
  if (obj.kind === ACCESS_PACK_KIND || Array.isArray(obj.accounts)) {
    const list = Array.isArray(obj.accounts) ? obj.accounts : [];
    const accounts = list
      .map((item) => normalizeAccount((item || {}) as Partial<JimengAccount>))
      .filter((a): a is JimengAccount => Boolean(a));
    if (!accounts.length && !obj.settings) {
      throw new Error("配置包里没有已登录账号");
    }
    const settings =
      obj.settings && typeof obj.settings === "object"
        ? (obj.settings as Partial<AccessSettingsSlice>)
        : {};
    return { accounts, settings };
  }

  // 整份 ApiSettings / localStorage 备份
  if (Array.isArray(obj.jimengAccounts)) {
    const accounts = (obj.jimengAccounts as unknown[])
      .map((item) => normalizeAccount((item || {}) as Partial<JimengAccount>))
      .filter((a): a is JimengAccount => Boolean(a));
    const { jimengAccounts: _drop, ...rest } = obj as Partial<ApiSettings> & {
      jimengAccounts?: unknown;
    };
    return { accounts, settings: rest as Partial<AccessSettingsSlice> };
  }

  // 仅账号数组
  if (Array.isArray(raw)) {
    const accounts = (raw as unknown[])
      .map((item) => normalizeAccount((item || {}) as Partial<JimengAccount>))
      .filter((a): a is JimengAccount => Boolean(a));
    if (!accounts.length) throw new Error("配置包里没有已登录账号");
    return { accounts, settings: {} };
  }

  throw new Error("无法识别的配置包格式");
}

/** 合并导入结果到当前设置（账号按 id / session / 手机号去重） */
export function mergeAccessPack(
  current: ApiSettings,
  pack: ParsedAccessPack,
  mode: "replace" | "merge" = "merge",
): ApiSettings {
  const incoming = pack.accounts;
  let accounts: JimengAccount[];

  if (mode === "replace") {
    accounts = incoming;
  } else {
    const byKey = new Map<string, JimengAccount>();
    const keyOf = (a: JimengAccount) => {
      if (a.phone?.trim()) return `${a.platform}:${a.phone.trim()}`;
      return `${a.platform}:sid:${a.sessionId.trim()}`;
    };
    for (const a of current.jimengAccounts) {
      byKey.set(keyOf(a), a);
    }
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
              // 导入包缺 conversationId 时保留本机已有聊天窗
              conversationId: a.conversationId || prev.conversationId,
            }
          : a,
      );
    }
    accounts = [...byKey.values()];
  }

  const slice = pack.settings || {};
  let next: ApiSettings = {
    ...current,
    ...pickDefined(slice),
    jimengAccounts: accounts,
  };

  // 缺省补齐
  if (!next.doubaoApiBase) next.doubaoApiBase = DEFAULT_SETTINGS.doubaoApiBase;
  if (!next.jimengProxyBase)
    next.jimengProxyBase = DEFAULT_SETTINGS.jimengProxyBase;
  if (!next.xyqProxyBase) next.xyqProxyBase = DEFAULT_SETTINGS.xyqProxyBase;
  if (!Array.isArray(next.fallbackProviders)) next.fallbackProviders = [];

  // 校正当前账号，并同步该账号的对话窗镜像
  const activeId =
    next.activeAccountId && accounts.some((a) => a.id === next.activeAccountId)
      ? next.activeAccountId
      : accounts[0]?.id || "";
  next = activeId
    ? withActiveAccount({ ...next, activeAccountId: activeId }, activeId)
    : { ...next, activeAccountId: "", doubaoConversationId: "" };

  return next;
}

function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function downloadAccessPack(filename: string, pack: AccessPack) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readAccessPackFile(file: File): Promise<ParsedAccessPack> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        resolve(parseAccessPack(JSON.parse(text) as unknown));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("无法解析配置包"));
      }
    };
    reader.onerror = () => reject(new Error("读取配置包失败"));
    reader.readAsText(file);
  });
}
