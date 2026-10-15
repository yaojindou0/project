import type { ApiSettings, JimengAccount } from "./types";

function isAccountReady(account: JimengAccount) {
  return Boolean(account.enabled && account.sessionId?.trim());
}

/** 解析并校正当前账号 id（缺失或已删时回落到第一个可用账号） */
export function resolveActiveAccountId(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
): string | undefined {
  const accounts = settings.jimengAccounts;
  if (!accounts.length) return undefined;
  const activeId = settings.activeAccountId?.trim();
  if (activeId && accounts.some((a) => a.id === activeId)) return activeId;
  const ready = accounts.find((a) => isAccountReady(a));
  return (ready || accounts[0])?.id;
}

/** 当前选中的额度账号（不自动轮换） */
export function resolveSelectedAccount(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
): JimengAccount | null {
  const id = resolveActiveAccountId(settings);
  if (!id) return null;
  return settings.jimengAccounts.find((a) => a.id === id) || null;
}

/** 已启用的豆包网页账号（仅当前选定账号，不因冷却拦截） */
export function listDoubaoWebAccounts(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
): JimengAccount[] {
  const activeId = resolveActiveAccountId(settings);
  return settings.jimengAccounts.filter(
    (a) =>
      a.enabled &&
      a.platform === "doubao" &&
      a.sessionId?.trim() &&
      (!activeId || a.id === activeId),
  );
}

/** 从设置中取当前选用的豆包网页账号（仅 active，不自动切号） */
export function resolveDoubaoWebAccount(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
): JimengAccount | null {
  const selected = resolveSelectedAccount(settings);
  if (
    selected &&
    selected.platform === "doubao" &&
    isAccountReady(selected)
  ) {
    return selected;
  }
  return null;
}

/** 账号展示名：标签 / 手机号 / 截断 session */
export function formatAccountLabel(account: JimengAccount): string {
  const phone = account.phone?.trim();
  const label = account.label?.trim();
  if (label && phone && !label.includes(phone)) {
    return `${label}（${phone}）`;
  }
  if (label) return label;
  if (phone) return phone;
  const sid = account.sessionId.trim();
  return sid.length > 8 ? `豆包…${sid.slice(-6)}` : "豆包账号";
}

/** 从设置中取已启用的豆包网页 sessionid（客户端/服务端均可） */
export function resolveDoubaoWebSession(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
): string | null {
  return resolveDoubaoWebAccount(settings)?.sessionId.trim() || null;
}

export function hasDoubaoWebSession(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId">,
) {
  return Boolean(resolveDoubaoWebSession(settings));
}

/** 当前优先使用的额度账号（用户选定，不自动轮换） */
export function resolveActiveQuotaAccount(
  settings: Pick<
    ApiSettings,
    "jimengAccounts" | "activeAccountId" | "videoProvider"
  >,
): { platform: string; label: string } | null {
  const selected = resolveSelectedAccount(settings);
  if (!selected?.sessionId?.trim()) return null;

  const platformLabel =
    selected.platform === "doubao"
      ? "豆包"
      : selected.platform === "jimeng"
        ? "即梦"
        : selected.platform === "xyq"
          ? "小云雀"
          : "账号";

  return { platform: platformLabel, label: formatAccountLabel(selected) };
}

/** 登录/导入后把指定账号设为当前使用 */
export function withActiveAccount(
  settings: ApiSettings,
  accountId: string,
): ApiSettings {
  if (!settings.jimengAccounts.some((a) => a.id === accountId)) return settings;
  const acc = settings.jimengAccounts.find((a) => a.id === accountId);
  return {
    ...settings,
    activeAccountId: accountId,
    // 镜像当前账号的对话窗，便于旧字段兼容
    doubaoConversationId: acc?.conversationId || "",
  };
}

function isRealConversationId(id?: string | null): id is string {
  const v = (id || "").trim();
  return Boolean(v) && v !== "0" && !v.startsWith("static-");
}

/** 当前豆包账号绑定的对话 id（每账号一个聊天窗；不跨号回落全局镜像） */
export function resolveAccountConversationId(
  settings: Pick<ApiSettings, "jimengAccounts" | "activeAccountId" | "doubaoConversationId">,
): string | undefined {
  const selected = resolveSelectedAccount(settings);
  if (selected?.platform === "doubao" && isRealConversationId(selected.conversationId)) {
    return selected.conversationId!.trim();
  }
  // 仅当当前豆包账号尚未绑定时，才把全局镜像视为待迁移值
  if (
    selected?.platform === "doubao" &&
    !selected.conversationId?.trim() &&
    isRealConversationId(settings.doubaoConversationId)
  ) {
    return settings.doubaoConversationId!.trim();
  }
  return undefined;
}

/** 把对话 id 写回当前/指定豆包账号，并同步全局镜像字段 */
export function persistAccountConversationId(
  settings: ApiSettings,
  conversationId: string | undefined | null,
  accountId?: string,
): ApiSettings {
  const id = (conversationId || "").trim();
  if (!isRealConversationId(id)) return settings;
  const targetId =
    accountId?.trim() ||
    resolveActiveAccountId(settings) ||
    settings.activeAccountId?.trim();
  if (!targetId) {
    return { ...settings, doubaoConversationId: id };
  }
  return {
    ...settings,
    doubaoConversationId: id,
    jimengAccounts: settings.jimengAccounts.map((a) =>
      a.id === targetId ? { ...a, conversationId: id } : a,
    ),
  };
}
