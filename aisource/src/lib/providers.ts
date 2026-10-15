import "server-only";

import { DoubaoAccountError, generateDoubaoVideo } from "./doubao";
import {
  buildOmniPrompt,
  generateJimengVideo,
  isDoubaoQuotaChat,
  pickJimengAccount,
  shouldUseMockVideo,
} from "./jimeng";
import {
  buildProviderQueue,
  filterAccountsForProvider,
  providerReady,
} from "./provider-status";
import type {
  ApiSettings,
  CharacterCard,
  JimengAccount,
  SeedanceVariant,
  VideoProvider,
} from "./types";
import { PROVIDER_PRESETS } from "./types";

export interface GenerateVideoInput {
  settings: ApiSettings;
  prompt: string;
  duration: number;
  aspectRatio: string;
  variant?: SeedanceVariant;
  imageUrls: string[];
  /** 与 imageUrls 顺序一致：角色图 → 场景 → 首帧 → 末帧 */
  imageMeta?: {
    characterCount: number;
    hasScene?: boolean;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
  };
  lockedCharacters: CharacterCard[];
  provider?: VideoProvider;
  /** 复用豆包同一对话 */
  conversationId?: string;
}

export interface GenerateVideoResult {
  videoUrl?: string;
  model: string;
  mode: VideoProvider;
  accountLabel?: string;
  accounts: JimengAccount[];
  tried: VideoProvider[];
  chatText?: string;
  conversationId?: string;
}

function resolveBase(settings: ApiSettings, provider: VideoProvider) {
  if (provider === "doubao") {
    return settings.doubaoApiBase || PROVIDER_PRESETS.doubao.apiBase;
  }
  if (provider === "jimeng") {
    return settings.jimengProxyBase || "http://127.0.0.1:5100";
  }
  if (provider === "xyq") {
    return settings.xyqProxyBase || "http://127.0.0.1:5200";
  }
  return settings.jimengApiBase;
}

function withProviderBase(
  settings: ApiSettings,
  provider: VideoProvider,
): ApiSettings {
  const base = resolveBase(settings, provider);
  if (provider === "doubao") {
    return {
      ...settings,
      videoProvider: "doubao",
      jimengApiBase: base,
      seedanceMiniModel:
        settings.videoProvider === "doubao"
          ? settings.seedanceMiniModel
          : PROVIDER_PRESETS.doubao.seedanceMiniModel,
      seedanceFastModel:
        settings.videoProvider === "doubao"
          ? settings.seedanceFastModel
          : PROVIDER_PRESETS.doubao.seedanceFastModel,
    };
  }
  if (provider === "jimeng") {
    return {
      ...settings,
      videoProvider: "jimeng",
      jimengApiBase: base,
      jimengAccounts: filterAccountsForProvider(settings.jimengAccounts, "jimeng"),
      seedanceMiniModel: PROVIDER_PRESETS.jimeng.seedanceMiniModel,
      seedanceFastModel: PROVIDER_PRESETS.jimeng.seedanceFastModel,
    };
  }
  if (provider === "xyq") {
    return {
      ...settings,
      videoProvider: "xyq",
      jimengApiBase: base,
      jimengAccounts: filterAccountsForProvider(settings.jimengAccounts, "xyq"),
      seedanceMiniModel: PROVIDER_PRESETS.xyq.seedanceMiniModel,
      seedanceFastModel: PROVIDER_PRESETS.xyq.seedanceFastModel,
    };
  }
  return settings;
}

async function generateOnce(
  provider: VideoProvider,
  input: GenerateVideoInput,
): Promise<GenerateVideoResult> {
  const settings = withProviderBase(input.settings, provider);
  const imageMeta = input.imageMeta || {
    characterCount: input.lockedCharacters.length,
    hasFirstFrame: input.imageUrls.length > input.lockedCharacters.length,
  };

  if (provider === "doubao") {
    // 豆包：分镜词已带「生成视频：」；上传角色+场景+首帧等多图；仅用当前选定账号
    const result = await generateDoubaoVideo({
      settings,
      prompt: input.prompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      variant: input.variant,
      imageUrls: input.imageUrls,
      imageMeta,
      lockedCharacters: input.lockedCharacters,
      conversationId: input.conversationId,
    });
    return {
      videoUrl: result.videoUrl,
      model: result.model,
      mode: "doubao",
      accountLabel: result.accountLabel || "豆包网页",
      accounts: result.accounts,
      tried: ["doubao"],
      chatText: result.chatText,
      conversationId: result.conversationId,
    };
  }

  const omniPrompt = buildOmniPrompt(
    input.prompt,
    input.lockedCharacters,
    imageMeta,
    input.aspectRatio,
    input.duration,
  );

  if (!pickJimengAccount(settings.jimengAccounts, settings.activeAccountId)) {
    throw new Error(
      `${provider === "xyq" ? "小云雀" : "即梦"}没有可用账号（请检查是否已选定并启用）`,
    );
  }

  const result = await generateJimengVideo({
    settings,
    prompt: omniPrompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    variant: input.variant,
    imageUrls: input.imageUrls,
    useOmni: input.imageUrls.length > 0,
  });

  const mergedAccounts = mergeAccountStats(
    input.settings.jimengAccounts,
    result.accounts,
  );

  return {
    videoUrl: result.videoUrl,
    model: result.model,
    mode: provider,
    accountLabel: `${provider === "xyq" ? "小云雀" : "即梦"} · ${result.account.label}`,
    accounts: mergedAccounts,
    tried: [provider],
  };
}

function mergeAccountStats(
  all: JimengAccount[],
  updatedSubset: JimengAccount[],
) {
  const map = new Map(updatedSubset.map((a) => [a.id, a]));
  return all.map((a) => map.get(a.id) || a);
}

export async function generateVideoWithFallback(
  input: GenerateVideoInput,
): Promise<GenerateVideoResult> {
  if (shouldUseMockVideo(input.settings) && input.settings.useMock) {
    throw new Error("MOCK_REQUIRED");
  }

  let queue = input.provider
    ? [input.provider]
    : buildProviderQueue(input.settings);

  const errors: string[] = [];
  const tried: VideoProvider[] = [];
  let latestAccounts = input.settings.jimengAccounts;
  let chatKeep: GenerateVideoResult | null = null;
  // 仅在用户开启「自动回退」时才扩到其他通道；账号本身不再自动轮换
  const allowSoftExpand =
    Boolean(input.settings.autoFallback) && !input.provider;
  let softExpanded = false;

  for (let qi = 0; qi < queue.length; qi++) {
    const provider = queue[qi];
    if (provider === "mock") continue;
    if (!providerReady(provider, { ...input.settings, jimengAccounts: latestAccounts })) {
      errors.push(
        `${labelOf(provider)}未登录（${
          provider === "doubao"
            ? "请登录豆包或填写方舟 API Key"
            : "请先手机号登录获取 session"
        }）`,
      );
      continue;
    }
    tried.push(provider);
    try {
      const result = await generateOnce(provider, {
        ...input,
        settings: { ...input.settings, jimengAccounts: latestAccounts },
      });
      latestAccounts = result.accounts;
      if (result.videoUrl) {
        return { ...result, tried, accounts: latestAccounts };
      }
      if (result.chatText && isDoubaoQuotaChat(result.chatText)) {
        errors.push(`${labelOf(provider)}: 额度用尽`);
        if (allowSoftExpand && !softExpanded) {
          softExpanded = true;
          for (const p of ["jimeng", "xyq"] as VideoProvider[]) {
            if (
              !queue.includes(p) &&
              providerReady(p, {
                ...input.settings,
                jimengAccounts: latestAccounts,
              })
            ) {
              queue = [...queue, p];
            }
          }
        }
      } else if (result.chatText) {
        chatKeep = { ...result, tried, accounts: latestAccounts };
        errors.push(`${labelOf(provider)}: 未出视频，已返回对话`);
      } else {
        errors.push(`${labelOf(provider)}: 未返回视频`);
      }
    } catch (e) {
      if (e instanceof DoubaoAccountError) {
        latestAccounts = mergeAccountStats(latestAccounts, e.accounts);
      } else if (
        e &&
        typeof e === "object" &&
        "accounts" in e &&
        Array.isArray((e as { accounts?: unknown }).accounts)
      ) {
        latestAccounts = mergeAccountStats(
          latestAccounts,
          (e as { accounts: JimengAccount[] }).accounts,
        );
      }
      const msg = e instanceof Error ? e.message : "生成失败";
      errors.push(`${labelOf(provider)}: ${msg}`);

      if (
        allowSoftExpand &&
        !softExpanded &&
        provider === "doubao" &&
        (isDoubaoQuotaChat(msg) ||
          /技能未启动|当成聊天|方舟: 未配置|未返回任务|已返回对话|未出视频|额度用尽/.test(
            msg,
          ))
      ) {
        softExpanded = true;
        for (const p of ["jimeng", "xyq"] as VideoProvider[]) {
          if (
            !queue.includes(p) &&
            providerReady(p, {
              ...input.settings,
              jimengAccounts: latestAccounts,
            })
          ) {
            queue = [...queue, p];
          }
        }
      }
    }
  }

  if (chatKeep) return { ...chatKeep, accounts: latestAccounts };

  const err = new Error(
    `全部通道失败（已试：${tried.map(labelOf).join(" → ") || "无"}）。${errors.join("；")}`,
  ) as Error & { accounts: JimengAccount[] };
  err.accounts = latestAccounts;
  throw err;
}

function labelOf(p: VideoProvider) {
  if (p === "doubao") return "豆包";
  if (p === "jimeng") return "即梦";
  if (p === "xyq") return "小云雀";
  return p;
}
