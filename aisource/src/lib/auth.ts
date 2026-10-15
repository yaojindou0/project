import type { JimengAccount, VideoProvider } from "./types";

export type AuthPlatform = "doubao" | "jimeng" | "xyq";

export function maskPhone(phone: string) {
  const p = phone.replace(/\D/g, "");
  if (p.length < 7) return phone;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function isValidCnPhone(phone: string) {
  return /^1\d{10}$/.test(normalizePhone(phone));
}

/** 简单内存限频（进程内）：同号 60s 一次，全局每分钟最多 8 次 */
const lastSendByPhone = new Map<string, number>();
let globalSendTimestamps: number[] = [];

export function assertSendCodeAllowed(phone: string) {
  const now = Date.now();
  const key = normalizePhone(phone);
  const last = lastSendByPhone.get(key) || 0;
  if (now - last < 60_000) {
    throw new Error("同一手机号 60 秒内只能发送一次验证码");
  }
  globalSendTimestamps = globalSendTimestamps.filter((t) => now - t < 60_000);
  if (globalSendTimestamps.length >= 8) {
    throw new Error("发送过于频繁，请稍后再试");
  }
  lastSendByPhone.set(key, now);
  globalSendTimestamps.push(now);
}

export function platformToAccountPlatform(
  platform: AuthPlatform,
): JimengAccount["platform"] {
  if (platform === "doubao") return "doubao";
  if (platform === "jimeng") return "jimeng";
  if (platform === "xyq") return "xyq";
  return "any";
}

export function authPlatformLabel(p: AuthPlatform) {
  if (p === "doubao") return "豆包";
  if (p === "xyq") return "小云雀";
  return "即梦";
}

export function providerNeedsPhoneLogin(p: VideoProvider) {
  return p === "doubao" || p === "jimeng" || p === "xyq";
}

/** 是否已有任一通道的已注册登录 session */
export function hasAnyLoggedInQuota(accounts: JimengAccount[]) {
  return accounts.some((a) => a.enabled && a.sessionId?.trim());
}
