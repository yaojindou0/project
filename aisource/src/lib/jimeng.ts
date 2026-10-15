import type {
  ApiSettings,
  CharacterCard,
  JimengAccount,
  SeedanceVariant,
} from "./types";
import { REGION_PREFIX } from "./types";
import { hasDoubaoWebSession } from "./doubao-session";
import { putTmpMedia } from "./tmp-media";
import { withGenerateVideoPrefix } from "./video-prompt";

/** 即梦/小云雀代理类额度错误（不含豆包闲聊误伤词） */
const JIMENG_QUOTA_HINTS = [
  "quota",
  "积分不足",
  "额度不足",
  "insufficient",
  "credit",
];

/**
 * 豆包「今日免费次数用完」类回复（仅用于识别额度话术并提示换号，不锁号）。
 * 例：今日视频生成免费次数用完了，你明天再来找我继续吧。开通豆包专业版…
 */
const DOUBAO_QUOTA_CORE_RE =
  /今日(?:视频生成)?免费次数用完了?|视频生成免费次数用完了?|免费次数用完了?/;

const DOUBAO_QUOTA_CONTEXT_RE =
  /明天再来(?:找我)?|开通豆包(?:专业版|订阅)?|创作额度包|按需购买创作额度|免等待继续创作|获得更多创作次数|高级创作模型/;

const DOUBAO_QUOTA_CODE_RE =
  /answer_quota_limit|single_function_limit/;

/** @deprecated 已取消账号冷却；保留函数避免旧调用报错 */
export function cooldownMinutesUntilTomorrow(): number {
  return 0;
}

export function resolveSeedanceModel(
  settings: ApiSettings,
  variant?: SeedanceVariant,
) {
  const v = variant || settings.seedanceVariant;
  return v === "fast"
    ? settings.seedanceFastModel
    : settings.seedanceMiniModel;
}

/** 仅使用当前选定账号（不自动轮换） */
export function pickJimengAccount(
  accounts: JimengAccount[],
  activeAccountId?: string,
): JimengAccount | null {
  const ready = (a: JimengAccount) =>
    a.enabled && a.platform !== "doubao" && Boolean(a.sessionId.trim());

  const activeId = activeAccountId?.trim();
  if (activeId) {
    const selected = accounts.find((a) => a.id === activeId);
    return selected && ready(selected) ? selected : null;
  }
  // 未指定当前账号时，取第一个可用（兼容旧数据）
  return accounts.find(ready) || null;
}

export function markAccountUsed(
  accounts: JimengAccount[],
  accountId: string,
): JimengAccount[] {
  return accounts.map((a) =>
    a.id === accountId
      ? { ...a, usedCount: a.usedCount + 1, lastError: undefined }
      : a,
  );
}

/** 只记录错误，不再写入冷却（额度用尽也不锁号，由用户手动换号） */
export function markAccountCooldown(
  accounts: JimengAccount[],
  accountId: string,
  error: string,
  _minutes = 30,
): JimengAccount[] {
  return accounts.map((a) =>
    a.id === accountId
      ? {
          ...a,
          lastError: error,
          cooldownUntil: undefined,
        }
      : a,
  );
}

/** 即梦/小云雀等代理报错是否像额度不足（不用于豆包冷却） */
export function isQuotaError(message: string) {
  if (!message) return false;
  if (isDoubaoQuotaChat(message)) return true;
  const lower = message.toLowerCase();
  return JIMENG_QUOTA_HINTS.some((h) => lower.includes(h.toLowerCase()));
}

/**
 * 豆包回复是否为「今日免费次数用完」类额度话术。
 * 仅此类才应对账号写入次日冷却；普通失败 / 含 limit、频繁 等不冷却。
 */
export function isDoubaoQuotaChat(text?: string | null) {
  if (!text?.trim()) return false;
  const t = text.replace(/\s+/g, "");
  if (DOUBAO_QUOTA_CODE_RE.test(t)) return true;
  // 核心「免费次数用完」+ 配套话术（明天再来 / 额度包 / 专业版等）
  if (DOUBAO_QUOTA_CORE_RE.test(t) && DOUBAO_QUOTA_CONTEXT_RE.test(t)) {
    return true;
  }
  // 完整官方句式：今日…免费次数用完…明天再来
  if (
    /今日.{0,12}免费次数用完/.test(t) &&
    /明天再来/.test(t)
  ) {
    return true;
  }
  return false;
}

export interface OmniImageMeta {
  characterCount: number;
  hasScene?: boolean;
  hasFirstFrame?: boolean;
  hasLastFrame?: boolean;
}

export function buildOmniPrompt(
  storyboardPrompt: string,
  lockedCharacters: CharacterCard[],
  meta?: OmniImageMeta | boolean,
  aspectRatio?: string,
  duration?: number,
) {
  // 兼容旧调用：第三个参数为 boolean 时视为 hasFirstFrame
  const m: OmniImageMeta =
    typeof meta === "boolean"
      ? { characterCount: lockedCharacters.length, hasFirstFrame: meta }
      : meta || { characterCount: lockedCharacters.length };

  const refs: string[] = [];
  lockedCharacters.forEach((c, i) => {
    const slot = `image_file_${i + 1}`;
    refs.push(
      `@${slot} 锁定角色「${c.name}」形象与服装（三视图/参考图），保持人物一致性`,
    );
  });
  let next = Math.max(m.characterCount, lockedCharacters.length) + 1;
  if (m.hasScene) {
    refs.push(`@image_file_${next} 作为本镜场景环境参考（空镜氛围）`);
    next += 1;
  }
  if (m.hasFirstFrame) {
    refs.push(`@image_file_${next} 作为本镜首帧构图参考`);
    next += 1;
  }
  if (m.hasLastFrame) {
    refs.push(
      `@image_file_${next} 作为本镜末帧定格参考，视频结尾向此构图过渡`,
    );
  }
  if (!refs.length) {
    return withGenerateVideoPrefix(storyboardPrompt, aspectRatio, duration);
  }
  return withGenerateVideoPrefix(
    `${refs.join("。")}。\n\n分镜内容：${storyboardPrompt}`,
    aspectRatio,
    duration,
  );
}

export async function generateJimengVideo(input: {
  settings: ApiSettings;
  prompt: string;
  duration: number;
  aspectRatio: string;
  variant?: SeedanceVariant;
  /** 角色锁定参考图 + 可选首帧，按顺序映射 image_file_n */
  imageUrls: string[];
  useOmni: boolean;
}): Promise<{
  videoUrl: string;
  account: JimengAccount;
  model: string;
  accounts: JimengAccount[];
}> {
  const base = input.settings.jimengApiBase.replace(/\/$/, "");
  if (!base) throw new Error("请先在设置中配置即梦/小云雀兼容代理地址");

  let accounts = [...input.settings.jimengAccounts];
  const account = pickJimengAccount(
    accounts,
    input.settings.activeAccountId,
  );
  if (!account) {
    throw new Error(
      "当前未选定可用的即梦/小云雀账号。请在设置中选择要使用的账号，或先登录获取额度。",
    );
  }

  const model = resolveSeedanceModel(input.settings, input.variant);
  const token = `${REGION_PREFIX[account.region]}${account.sessionId.trim()}`;

  try {
    const videoUrl = await callJimengOnce({
      base,
      token,
      model,
      prompt: input.prompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      imageUrls: input.imageUrls,
      useOmni: input.useOmni,
    });
    accounts = markAccountUsed(accounts, account.id);
    return { videoUrl, account, model, accounts };
  } catch (e) {
    const lastError = e instanceof Error ? e.message : "生成失败";
    if (isQuotaError(lastError)) {
      accounts = markAccountCooldown(accounts, account.id, lastError, 45);
    } else {
      accounts = markAccountCooldown(accounts, account.id, lastError, 5);
    }
    const err = new Error(
      `${lastError}。当前账号不可用时请在设置中手动切换其他账号后重试。`,
    ) as Error & { accounts: JimengAccount[] };
    err.accounts = accounts;
    throw err;
  }
}

async function callJimengOnce(opts: {
  base: string;
  token: string;
  model: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  imageUrls: string[];
  useOmni: boolean;
}) {
  const duration = Math.min(Math.max(Math.round(opts.duration), 4), 15);

  if (opts.useOmni && opts.imageUrls.length > 0) {
    const form = new FormData();
    form.append("model", opts.model);
    form.append("prompt", opts.prompt);
    form.append("duration", String(duration));
    form.append("ratio", opts.aspectRatio);
    form.append("resolution", "720p");
    form.append("functionMode", "omni_reference");
    for (let i = 0; i < opts.imageUrls.length; i++) {
      await appendImageField(form, `image_file_${i + 1}`, opts.imageUrls[i]);
    }

    const res = await fetch(`${opts.base}/v1/videos/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}` },
      body: form,
      signal: AbortSignal.timeout(320_000),
    });
    return parseVideoResponse(res);
  }

  const httpUrls = opts.imageUrls.filter((u) => /^https?:\/\//i.test(u));
  const dataUrls = opts.imageUrls.filter((u) => u.startsWith("data:"));

  if (dataUrls.length > 0) {
    const form = new FormData();
    form.append("model", opts.model);
    form.append("prompt", opts.prompt);
    form.append("duration", String(duration));
    form.append("ratio", opts.aspectRatio);
    form.append("resolution", "720p");
    for (let i = 0; i < opts.imageUrls.length; i++) {
      await appendImageField(form, `image_file_${i + 1}`, opts.imageUrls[i]);
    }
    const res = await fetch(`${opts.base}/v1/videos/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}` },
      body: form,
      signal: AbortSignal.timeout(320_000),
    });
    return parseVideoResponse(res);
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
    duration,
    ratio: opts.aspectRatio,
    resolution: "720p",
  };
  if (httpUrls.length === 1) {
    body.filePaths = [httpUrls[0]];
  } else if (httpUrls.length >= 2) {
    body.filePaths = httpUrls.slice(0, 2);
  }

  const res = await fetch(`${opts.base}/v1/videos/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(320_000),
  });
  return parseVideoResponse(res);
}

async function appendImageField(form: FormData, field: string, src: string) {
  if (src.startsWith("data:")) {
    const file = dataUrlToFile(src, `${field}.png`);
    form.append(field, file);
    return;
  }
  form.append(field, src);
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png";
  const bin = Buffer.from(b64, "base64");
  return new File([bin], filename, { type: mime });
}

async function parseVideoResponse(res: Response) {
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`即梦响应非 JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const errObj = data as { error?: { message?: string }; message?: string };
    throw new Error(
      errObj.error?.message || errObj.message || `HTTP ${res.status}`,
    );
  }

  const obj = data as {
    data?: { url?: string; b64_json?: string }[];
    video_url?: string;
    url?: string;
  };
  const remote =
    obj.data?.[0]?.url || obj.video_url || obj.url || "";
  if (remote) return remote;
  const b64 = obj.data?.[0]?.b64_json;
  if (b64) {
    return putTmpMedia(Buffer.from(b64, "base64"), "video/mp4", "mp4");
  }
  throw new Error("即梦未返回视频地址");
}

/** 即梦兼容代理文生图（Seedream 系，默认 jimeng-4.5） */
export async function generateJimengImage(input: {
  settings: ApiSettings;
  prompt: string;
  aspectRatio?: string;
  model?: string;
}): Promise<{
  imageUrl: string;
  model: string;
  accountLabel: string;
  accounts: JimengAccount[];
}> {
  const preferXyq = input.settings.videoProvider === "xyq";
  const base = (
    preferXyq
      ? input.settings.xyqProxyBase || input.settings.jimengApiBase
      : input.settings.jimengProxyBase || input.settings.jimengApiBase
  ).replace(/\/$/, "");
  if (!base) {
    throw new Error("请先配置即梦/小云雀兼容代理（如 http://127.0.0.1:5100）");
  }

  let accounts = [...input.settings.jimengAccounts];
  const account = pickJimengAccount(
    accounts,
    input.settings.activeAccountId,
  );
  if (!account) {
    throw new Error(
      "当前未选定可用的即梦/小云雀账号。请在设置中选择要使用的账号。",
    );
  }

  const token = `${REGION_PREFIX[account.region]}${account.sessionId.trim()}`;
  const model = input.model?.trim() || "jimeng-4.5";
  const ratio = input.aspectRatio || "1:1";

  try {
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        ratio,
        resolution: "2k",
        response_format: "url",
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    let json: {
      error?: { message?: string } | string;
      data?: { url?: string; b64_json?: string }[];
      message?: string;
    } = {};
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `即梦生图代理无响应（请确认 ${base} 已启动）: ${text.slice(0, 160)}`,
      );
    }
    if (!res.ok) {
      const errMsg =
        typeof json.error === "string"
          ? json.error
          : json.error?.message || json.message || text.slice(0, 200);
      throw new Error(errMsg || `即梦生图失败 HTTP ${res.status}`);
    }
    const remote = json.data?.[0]?.url || "";
    let imageUrl = remote;
    if (!imageUrl && json.data?.[0]?.b64_json) {
      imageUrl = await putTmpMedia(
        Buffer.from(json.data[0].b64_json, "base64"),
        "image/png",
        "png",
      );
    }
    if (!imageUrl) throw new Error("即梦生图未返回图片地址");

    accounts = markAccountUsed(accounts, account.id);
    return {
      imageUrl,
      model: `jimeng:${model}`,
      accountLabel: account.label,
      accounts,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "即梦生图失败";
    if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)) {
      throw new Error(
        `无法连接即梦代理 ${base}：请先启动 jimeng-api（默认 :5100）后再试`,
      );
    }
    accounts = markAccountCooldown(accounts, account.id, msg, 5);
    throw e instanceof Error ? e : new Error(msg);
  }
}

export function shouldUseMockVideo(settings: ApiSettings) {
  if (settings.useMock) return true;
  if (settings.videoProvider === "mock") return true;
  if (settings.videoProvider === "doubao") {
    if (hasDoubaoWebSession(settings)) return false;
    if (
      settings.autoFallback &&
      settings.jimengAccounts.some(
        (a) => a.enabled && a.platform !== "doubao" && a.sessionId.trim(),
      )
    ) {
      return false;
    }
    return true;
  }
  if (settings.videoProvider === "jimeng" || settings.videoProvider === "xyq") {
    return !pickJimengAccount(
      settings.jimengAccounts,
      settings.activeAccountId,
    );
  }
  return true;
}
