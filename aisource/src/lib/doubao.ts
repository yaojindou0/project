import "server-only";

import type {
  ApiSettings,
  CharacterCard,
  JimengAccount,
  SeedanceVariant,
} from "./types";
import { generateArkSeedanceVideo, hasArkVideoAuth } from "./ark-video";
import { doubaoWebGenerateVideo } from "./doubao-web-chat";
import {
  formatAccountLabel,
  hasDoubaoWebSession,
  resolveDoubaoWebAccount,
} from "./doubao-session";
import {
  isDoubaoQuotaChat,
  markAccountCooldown,
  markAccountUsed,
} from "./jimeng";
import { withGenerateVideoPrefix } from "./video-prompt";

export type DoubaoVideoAsset = {
  url: string;
  role: "character" | "scene" | "first_frame" | "last_frame";
  label: string;
};

/** 按角色 → 场景 → 首帧 → 末帧收集参考图（与 imageUrls 顺序一致） */
export function collectDoubaoVideoAssets(input: {
  imageUrls: string[];
  lockedCharacters: CharacterCard[];
  imageMeta?: {
    characterCount: number;
    hasScene?: boolean;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
  };
}): DoubaoVideoAsset[] {
  const locked = input.lockedCharacters.filter(
    (c) => c.locked && (c.threeViewUrl || c.referenceImageUrl),
  );
  const meta = input.imageMeta || {
    characterCount: locked.length,
  };
  const assets: DoubaoVideoAsset[] = [];
  let i = 0;

  const charCount = Math.min(
    meta.characterCount ?? locked.length,
    locked.length,
    input.imageUrls.length,
  );
  for (let c = 0; c < charCount; c++) {
    const url = input.imageUrls[i++];
    if (!url) break;
    assets.push({
      url,
      role: "character",
      label: locked[c]?.name || `角色${c + 1}`,
    });
  }

  if (meta.hasScene && i < input.imageUrls.length) {
    const url = input.imageUrls[i++];
    if (url) assets.push({ url, role: "scene", label: "场景" });
  }
  if (meta.hasFirstFrame && i < input.imageUrls.length) {
    const url = input.imageUrls[i++];
    if (url) assets.push({ url, role: "first_frame", label: "首帧" });
  }
  if (meta.hasLastFrame && i < input.imageUrls.length) {
    const url = input.imageUrls[i++];
    if (url) assets.push({ url, role: "last_frame", label: "末帧" });
  }

  // 兜底：若 meta 未标齐但仍有剩余图
  while (i < input.imageUrls.length && assets.length < 9) {
    const url = input.imageUrls[i++];
    if (url) {
      assets.push({
        url,
        role: "character",
        label: `参考${assets.length + 1}`,
      });
    }
  }

  return assets.slice(0, 6);
}

function buildDoubaoVideoPrompt(
  basePrompt: string,
  assets: DoubaoVideoAsset[],
  aspectRatio?: string,
  duration?: number,
): string {
  const chars = assets.filter((a) => a.role === "character").map((a) => a.label);
  const hasScene = assets.some((a) => a.role === "scene");
  const hasFirst = assets.some((a) => a.role === "first_frame");
  const bits: string[] = [];
  if (chars.length) bits.push(`角色参考：${chars.join("、")}`);
  if (hasScene) bits.push("场景图已附图");
  if (hasFirst) bits.push("首帧已附图");
  const head = bits.length ? `${bits.join("；")}。\n` : "";
  return withGenerateVideoPrefix(
    `${head}${basePrompt}`.trim(),
    aspectRatio,
    duration,
  );
}

function accountLabelOf(account: JimengAccount) {
  return `豆包 · ${formatAccountLabel(account)}`;
}

/** 携带账号冷却状态的错误，便于上层回写 localStorage */
export class DoubaoAccountError extends Error {
  accounts: JimengAccount[];
  constructor(message: string, accounts: JimengAccount[]) {
    super(message);
    this.name = "DoubaoAccountError";
    this.accounts = accounts;
  }
}

export async function generateDoubaoVideo(input: {
  settings: ApiSettings;
  prompt: string;
  duration: number;
  aspectRatio: string;
  variant?: SeedanceVariant;
  imageUrls: string[];
  imageMeta?: {
    characterCount: number;
    hasScene?: boolean;
    hasFirstFrame?: boolean;
    hasLastFrame?: boolean;
  };
  lockedCharacters: CharacterCard[];
  /** 复用豆包网页同一对话（换账号时自动丢弃） */
  conversationId?: string;
}): Promise<{
  videoUrl?: string;
  model: string;
  chatText?: string;
  conversationId?: string;
  accountLabel?: string;
  accounts: JimengAccount[];
  /** 当前账号额度用尽（需手动换号或换通道） */
  quotaExhausted?: boolean;
}> {
  let accounts = [...input.settings.jimengAccounts];
  const assets = collectDoubaoVideoAssets(input);
  const prompt = buildDoubaoVideoPrompt(
    input.prompt,
    assets,
    input.aspectRatio,
    input.duration,
  );
  const refImageUrls = assets.map((a) => a.url);
  const errors: string[] = [];

  // 有方舟 Key 时优先官方 Seedance（不占网页免费次数）
  if (hasArkVideoAuth(input.settings)) {
    try {
      const ark = await generateArkSeedanceVideo({
        settings: input.settings,
        prompt,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        variant: input.variant,
        refAssets: assets,
        timeoutMs: 300_000,
      });
      return {
        ...ark,
        accountLabel: "豆包 · 方舟 API",
        accounts,
      };
    } catch (e) {
      errors.push(`方舟: ${e instanceof Error ? e.message : "失败"}`);
    }
  }

  const account = resolveDoubaoWebAccount({
    jimengAccounts: accounts,
    activeAccountId: input.settings.activeAccountId,
  });
  if (!account) {
    if (!hasArkVideoAuth(input.settings)) {
      throw new Error(
        "当前未选定可用的豆包账号。请在设置中选择要使用的豆包账号，或填写方舟 API Key。",
      );
    }
    throw new Error(
      `豆包视频失败。${errors.join("；") || "网页未选定账号"}。可靠出片请检查方舟 API Key`,
    );
  }

  const label = accountLabelOf(account);
  const accountId = account.id;
  // 优先本账号绑定的聊天窗，其次调用方传入；每账号固定一个，不另开
  const conversationId =
    (account.conversationId || "").trim() ||
    (input.conversationId || "").trim() ||
    undefined;

  function bindConversation(convId?: string | null) {
    const id = (convId || "").trim();
    if (!id || id === "0") return;
    accounts = accounts.map((a) =>
      a.id === accountId ? { ...a, conversationId: id } : a,
    );
  }

  try {
    const result = await doubaoWebGenerateVideo({
      sessionId: account.sessionId,
      cookieHeader: account.cookieHeader,
      prompt,
      ratio: input.aspectRatio,
      duration: input.duration,
      variant: input.variant,
      conversationId,
      refImageUrls,
      refAssets: assets.map((a) => ({
        url: a.url,
        role: a.role,
        label: a.label,
      })),
      timeoutMs: 300_000,
    });
    bindConversation(result.conversationId || conversationId);

    if (result.videoUrl) {
      accounts = markAccountUsed(accounts, accountId);
      return {
        ...result,
        conversationId: result.conversationId || conversationId,
        accountLabel: label,
        accounts,
      };
    }

    // 额度用尽：只记错误，不冷却；用户手动换号
    if (result.chatText && isDoubaoQuotaChat(result.chatText)) {
      accounts = markAccountCooldown(
        accounts,
        accountId,
        "今日视频免费次数用完",
      );
      throw new DoubaoAccountError(
        `${label}: 额度用尽。请在设置中手动切换其他账号后重试。`,
        accounts,
      );
    }

    if (result.chatText) {
      return {
        model: result.model,
        chatText: result.chatText,
        conversationId: result.conversationId || conversationId,
        accountLabel: label,
        accounts,
      };
    }

    // 非额度失败：只记错误，不冷却（避免误锁账号）
    accounts = accounts.map((a) =>
      a.id === accountId
        ? { ...a, lastError: "未返回视频" }
        : a,
    );
    errors.push(`${label}: 未返回视频`);
  } catch (e) {
    if (e instanceof DoubaoAccountError) throw e;
    const msg = e instanceof Error ? e.message : "失败";
    if (isDoubaoQuotaChat(msg)) {
      accounts = markAccountCooldown(accounts, accountId, msg.slice(0, 120));
      throw new DoubaoAccountError(
        `${label}: 额度用尽。请在设置中手动切换其他账号后重试。`,
        accounts,
      );
    }
    accounts = accounts.map((a) =>
      a.id === accountId
        ? { ...a, lastError: msg.slice(0, 120) }
        : a,
    );
    errors.push(`${label}: ${msg}`);
  }

  if (!hasArkVideoAuth(input.settings)) {
    errors.push("方舟: 未配置 API Key");
  }

  throw new DoubaoAccountError(
    `豆包视频失败。${errors.join("；") || "当前账号不可用"}。请手动切换账号或填写火山方舟 API Key`,
    accounts,
  );
}

export function shouldUseMockDoubao(settings: ApiSettings) {
  if (settings.useMock) return true;
  if (settings.videoProvider !== "doubao") return true;
  return !hasDoubaoWebSession(settings) && !hasArkVideoAuth(settings);
}
