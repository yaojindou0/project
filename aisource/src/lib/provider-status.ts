import { hasDoubaoWebSession } from "./doubao-session";
import type {
  ApiSettings,
  JimengAccount,
  ProviderPresetId,
  VideoProvider,
} from "./types";
import { PROVIDER_PRESETS } from "./types";

/** 客户端可用：不依赖 Node fs / 豆包网页协议 */

export function filterAccountsForProvider(
  accounts: JimengAccount[],
  provider: "jimeng" | "xyq",
) {
  return accounts.filter(
    (a) =>
      a.enabled &&
      a.sessionId.trim() &&
      a.platform !== "doubao" &&
      (a.platform === "any" || !a.platform || a.platform === provider),
  );
}

export function providerReady(
  provider: VideoProvider,
  settings: ApiSettings,
): boolean {
  if (provider === "mock") return true;
  if (provider === "doubao") {
    return (
      hasDoubaoWebSession(settings) || Boolean(settings.doubaoApiKey?.trim())
    );
  }
  if (provider === "jimeng" || provider === "xyq") {
    const filtered = filterAccountsForProvider(
      settings.jimengAccounts,
      provider,
    );
    const activeId = settings.activeAccountId?.trim();
    if (activeId) {
      // 仅当前选定账号可用时才算就绪，不自动换号
      return filtered.some((a) => a.id === activeId);
    }
    return filtered.length > 0;
  }
  return false;
}

export function buildProviderQueue(settings: ApiSettings): VideoProvider[] {
  const primary = settings.videoProvider;
  const queue: VideoProvider[] = [primary];
  if (!settings.autoFallback || primary === "mock") return queue;

  const fallbacks = (settings.fallbackProviders || ["jimeng", "xyq"]).filter(
    (p) => p !== primary && p !== "mock",
  );
  for (const p of fallbacks) {
    if (!queue.includes(p)) queue.push(p);
  }
  return queue;
}

export function applyProviderPreset(
  settings: ApiSettings,
  id: ProviderPresetId,
): ApiSettings {
  const preset = PROVIDER_PRESETS[id];
  const next: ApiSettings = {
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

export function describeChannelStatus(settings: ApiSettings) {
  const queue = buildProviderQueue(settings);
  return {
    primary: settings.videoProvider,
    autoFallback: settings.autoFallback,
    queue,
    doubaoReady: providerReady("doubao", settings),
    arkReady: Boolean(settings.doubaoApiKey?.trim()),
    jimengReady: providerReady("jimeng", settings),
    xyqReady: providerReady("xyq", settings),
    mock: settings.useMock,
  };
}
