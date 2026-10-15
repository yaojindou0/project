/**
 * 直连字节系 Web Passport 短信登录（不经本地代理）
 * 三通道一律「已注册手机号登录」type=24（禁止绑定/注册 type=34）。
 */
import type { AuthPlatform } from "./auth";
import { PASSPORT_CONFIG, SMS_LOGIN_TYPE } from "./passport-config";

export { PASSPORT_CONFIG, SMS_LOGIN_TYPE } from "./passport-config";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** mix_mode=1 字段 XOR 5 编码 */
export function xorEncode(input: string) {
  return [...input]
    .map((c) => (c.charCodeAt(0) ^ 5).toString(16).padStart(2, "0"))
    .join("");
}

type CookieJar = Map<string, string>;

interface PassportSession {
  jar: CookieJar;
  csrf: string;
  mobileTicket?: string;
  /** 固定已注册登录 */
  smsType: typeof SMS_LOGIN_TYPE;
  /** type 字段是否 XOR（与发码时保持一致） */
  encodeType: boolean;
  createdAt: number;
}

const sessions = new Map<string, PassportSession>();

function sessionKey(platform: AuthPlatform, phone: string) {
  return `${platform}:${phone}`;
}

function parseSetCookies(res: Response, jar: CookieJar) {
  const lines =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const line of lines) {
    const nv = line.split(";")[0];
    const i = nv.indexOf("=");
    if (i > 0) jar.set(nv.slice(0, i).trim(), nv.slice(i + 1).trim());
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function verifyFp() {
  const s = Math.random().toString(36).slice(2, 10);
  return `verify_${s}_${Date.now().toString(36)}`;
}

async function passportGet(url: string, jar: CookieJar, origin: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      Referer: `${origin}/`,
      Cookie: cookieHeader(jar),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  parseSetCookies(res, jar);
  return res;
}

async function ensureCsrf(platform: AuthPlatform, jar: CookieJar) {
  const cfg = PASSPORT_CONFIG[platform];
  await passportGet(`${cfg.origin}${cfg.loginPath}`, jar, cfg.origin);
  await passportGet(
    `${cfg.origin}/passport/web/web_login/?aid=${cfg.aid}&account_sdk_source=web&language=zh`,
    jar,
    cfg.origin,
  );
  const csrf =
    jar.get("passport_csrf_token") ||
    jar.get("passport_csrf_token_default") ||
    "";
  if (!csrf) {
    throw new Error(`${cfg.label}未能获取登录 CSRF，请稍后重试`);
  }
  return csrf;
}

function mapPassportError(
  code: number | undefined,
  description: string | undefined,
  platform: AuthPlatform,
) {
  const cfg = PASSPORT_CONFIG[platform];
  const desc = description?.trim() || "";
  if (desc.includes("已被绑定") || desc.includes("未注册") || code === 1001) {
    return `请使用已在${cfg.label}注册过的手机号登录发码（本站不支持绑定/注册新号）`;
  }
  if (code === 1105 || desc.includes("滑块") || code === 3052) {
    return `官方要求滑块验证：请先打开${cfg.label}官网，用同一手机号登录并完成滑块，成功后再回本站重新获取验证码`;
  }
  if (code === 1206 || desc.includes("频繁")) {
    return desc || "验证码发送太频繁，请稍后再试";
  }
  if (code === 1204 || desc.includes("验证码请求错误")) {
    return `验证码请求被官方拒绝：请先在${cfg.label}官网完成一次登录/滑块，稍等 1–2 分钟后再试`;
  }
  if (desc) return desc;
  switch (code) {
    case 7:
      return "访问太频繁，请稍后再试";
    case 1203:
      return "验证码错误或已过期";
    default:
      return code ? `操作失败（错误码 ${code}）` : "操作失败";
  }
}

type PassportJson = {
  message?: string;
  data?: {
    error_code?: number;
    description?: string;
    mobile_ticket?: string;
    retry_time?: number;
    captcha?: string;
    verify_ticket?: string;
  };
};

function isSendSuccess(data: PassportJson) {
  return (
    data.message === "success" ||
    data.data?.error_code === 0 ||
    (data.message !== "error" && data.data?.error_code == null)
  );
}

async function postSendCode(input: {
  platform: AuthPlatform;
  jar: CookieJar;
  csrf: string;
  phone: string;
  encodeType: boolean;
}): Promise<PassportJson> {
  const cfg = PASSPORT_CONFIG[input.platform];
  const url = new URL(`${cfg.origin}/passport/web/send_code/`);
  url.searchParams.set("aid", cfg.aid);
  url.searchParams.set("account_sdk_source", "web");
  url.searchParams.set("language", "zh");
  url.searchParams.set("device_platform", "web");
  url.searchParams.set("verifyFp", verifyFp());

  // 强制已注册登录 type=24，绝不发送绑定/注册 34
  const typeField = input.encodeType
    ? xorEncode(SMS_LOGIN_TYPE)
    : SMS_LOGIN_TYPE;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Origin: cfg.origin,
      Referer: `${cfg.origin}${cfg.loginPath}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      Cookie: cookieHeader(input.jar),
      "x-tt-passport-csrf-token": input.csrf,
      Appid: cfg.aid,
    },
    body: new URLSearchParams({
      mix_mode: "1",
      mobile: xorEncode(input.phone),
      type: typeField,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  parseSetCookies(res, input.jar);
  const text = await res.text();
  try {
    return JSON.parse(text) as PassportJson;
  } catch {
    throw new Error(`${cfg.label}短信接口无响应: ${text.slice(0, 120)}`);
  }
}

/** 三通道统一：先 XOR type，再明文 type（仍为 24） */
function encodeTypeOrder(): boolean[] {
  return [true, false];
}

function saveSession(
  platform: AuthPlatform,
  phone: string,
  jar: CookieJar,
  csrf: string,
  data: PassportJson,
  encodeType: boolean,
) {
  const sess: PassportSession = {
    jar,
    csrf: jar.get("passport_csrf_token") || csrf,
    mobileTicket: data.data?.mobile_ticket,
    smsType: SMS_LOGIN_TYPE,
    encodeType,
    createdAt: Date.now(),
  };
  sessions.set(sessionKey(platform, phone), sess);
  return sess;
}

export function encodeHandoff(
  platform: AuthPlatform,
  phone: string,
  sess: PassportSession,
): string {
  const payload = {
    v: 1,
    platform,
    phone,
    cookies: Object.fromEntries(sess.jar),
    csrf: sess.csrf,
    mobileTicket: sess.mobileTicket || "",
    smsType: SMS_LOGIN_TYPE,
    encodeType: sess.encodeType,
    createdAt: sess.createdAt,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeHandoff(handoff?: string): {
  platform: AuthPlatform;
  phone: string;
  sess: PassportSession;
} | null {
  if (!handoff?.trim()) return null;
  try {
    const raw = JSON.parse(
      Buffer.from(handoff.trim(), "base64url").toString("utf8"),
    ) as {
      v?: number;
      platform: AuthPlatform;
      phone: string;
      cookies: Record<string, string>;
      csrf: string;
      mobileTicket?: string;
      smsType?: string;
      encodeType: boolean;
      createdAt: number;
    };
    if (!raw.platform || !raw.phone || !raw.cookies) return null;
    // 旧 handoff 若带 type=34，强制纠正为已注册登录
    const jar = new Map(Object.entries(raw.cookies));
    const sess: PassportSession = {
      jar,
      csrf: raw.csrf || jar.get("passport_csrf_token") || "",
      mobileTicket: raw.mobileTicket,
      smsType: SMS_LOGIN_TYPE,
      encodeType: Boolean(raw.encodeType),
      createdAt: raw.createdAt || Date.now(),
    };
    return { platform: raw.platform, phone: raw.phone, sess };
  } catch {
    return null;
  }
}

function withOfficialHint(message: string, platform: AuthPlatform) {
  const cfg = PASSPORT_CONFIG[platform];
  if (message.includes("|官网:")) return message;
  if (/风控|滑块|官网/.test(message)) {
    return `${message}|官网:${cfg.officialLoginUrl}`;
  }
  return message;
}

export async function directSendCode(input: {
  platform: AuthPlatform;
  phone: string;
}): Promise<{ message: string; requestId?: string; handoff: string }> {
  const phone = input.phone.replace(/\D/g, "");
  const cfg = PASSPORT_CONFIG[input.platform];
  const jar: CookieJar = new Map();
  const csrf = await ensureCsrf(input.platform, jar);

  for (const encodeType of encodeTypeOrder()) {
    const data = await postSendCode({
      platform: input.platform,
      jar,
      csrf: jar.get("passport_csrf_token") || csrf,
      phone,
      encodeType,
    });

    if (isSendSuccess(data)) {
      const sess = saveSession(
        input.platform,
        phone,
        jar,
        csrf,
        data,
        encodeType,
      );
      return {
        message: `验证码已发送至 ${phone.slice(0, 3)}****${phone.slice(-4)}（${cfg.label}·已注册登录）`,
        requestId: data.data?.mobile_ticket,
        handoff: encodeHandoff(input.platform, phone, sess),
      };
    }

    const code = data.data?.error_code;
    const desc = data.data?.description || "";

    if (code === 1206 || desc.includes("频繁")) {
      let handoff = "";
      if (data.data?.mobile_ticket) {
        const sess = saveSession(
          input.platform,
          phone,
          jar,
          csrf,
          data,
          encodeType,
        );
        handoff = encodeHandoff(input.platform, phone, sess);
      }
      const err = new Error(
        withOfficialHint(
          mapPassportError(code, desc, input.platform) +
            `（${cfg.label}直连 · 已注册登录）`,
          input.platform,
        ),
      ) as Error & { handoff?: string; risk?: boolean; errorCode?: number };
      err.handoff = handoff || undefined;
      err.errorCode = code;
      throw err;
    }

    // 滑块/风控：立即抛出，勿再试明文 type（会变成误导性的 1204）
    if (code === 1105 || code === 3052 || desc.includes("滑块")) {
      const err = new Error(
        withOfficialHint(
          mapPassportError(code, desc, input.platform) +
            `（${cfg.label}直连 · 已注册登录）`,
          input.platform,
        ),
      ) as Error & { risk?: boolean; errorCode?: number };
      err.risk = true;
      err.errorCode = code;
      throw err;
    }

    if (data.data?.mobile_ticket) {
      saveSession(input.platform, phone, jar, csrf, data, encodeType);
    }

    throw new Error(
      withOfficialHint(
        mapPassportError(code, desc, input.platform) +
          `（${cfg.label}直连 · 已注册登录）`,
        input.platform,
      ),
    );
  }

  // 理论上不会到这里（循环内必 return/throw）
  throw new Error(
    withOfficialHint(
      `${cfg.label}发码失败，请稍后重试（直连 · 已注册登录）`,
      input.platform,
    ),
  );
}

export async function directLoginWithCode(input: {
  platform: AuthPlatform;
  phone: string;
  code: string;
  handoff?: string;
}): Promise<{ sessionId?: string; apiKey?: string; label: string }> {
  const phone = input.phone.replace(/\D/g, "");
  const code = input.code.trim();
  const cfg = PASSPORT_CONFIG[input.platform];
  const key = sessionKey(input.platform, phone);

  const fromHandoff = decodeHandoff(input.handoff);
  let sess =
    (fromHandoff &&
    fromHandoff.platform === input.platform &&
    fromHandoff.phone === phone
      ? fromHandoff.sess
      : null) || sessions.get(key);

  if (!sess || Date.now() - sess.createdAt > 10 * 60_000) {
    const jar: CookieJar = new Map();
    const csrf = await ensureCsrf(input.platform, jar);
    sess = {
      jar,
      csrf,
      smsType: SMS_LOGIN_TYPE,
      encodeType: true,
      createdAt: Date.now(),
    };
  }

  // 强制已注册登录
  sess.smsType = SMS_LOGIN_TYPE;
  sessions.set(key, sess);

  const url = new URL(`${cfg.origin}/passport/web/sms_login/`);
  url.searchParams.set("aid", cfg.aid);
  url.searchParams.set("account_sdk_source", "web");
  url.searchParams.set("language", "zh");
  url.searchParams.set("device_platform", "web");
  url.searchParams.set("verifyFp", verifyFp());

  async function attempt(opts: {
    encodeCode: boolean;
    encodeType: boolean;
    useTicket: boolean;
  }) {
    const typeField = opts.encodeType
      ? xorEncode(SMS_LOGIN_TYPE)
      : SMS_LOGIN_TYPE;
    const body = new URLSearchParams({
      mix_mode: "1",
      mobile: xorEncode(phone),
      code: opts.encodeCode ? xorEncode(code) : code,
      type: typeField,
      ...(opts.useTicket && sess!.mobileTicket
        ? { mobile_ticket: sess!.mobileTicket }
        : {}),
    });

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Origin: cfg.origin,
        Referer: `${cfg.origin}${cfg.loginPath}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        Cookie: cookieHeader(sess!.jar),
        "x-tt-passport-csrf-token":
          sess!.jar.get("passport_csrf_token") || sess!.csrf,
        Appid: cfg.aid,
      },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    parseSetCookies(res, sess!.jar);
    const text = await res.text();
    try {
      return JSON.parse(text) as PassportJson;
    } catch {
      throw new Error(`${cfg.label}登录接口异常: ${text.slice(0, 120)}`);
    }
  }

  const encodeType = sess.encodeType;
  const attemptList = [
    { encodeCode: true, encodeType, useTicket: true },
    { encodeCode: false, encodeType, useTicket: true },
    { encodeCode: true, encodeType: !encodeType, useTicket: true },
    { encodeCode: false, encodeType: !encodeType, useTicket: true },
    { encodeCode: true, encodeType, useTicket: false },
    { encodeCode: false, encodeType, useTicket: false },
  ];

  let data: PassportJson | null = null;
  for (const opts of attemptList) {
    data = await attempt(opts);
    const err = data.data?.error_code;
    if (
      data.message === "success" ||
      err === 0 ||
      sess.jar.get("sessionid") ||
      sess.jar.get("sessionid_ss")
    ) {
      break;
    }
    if (err === 1203) break;
    if (err === 1206 && !opts.encodeCode) break;
    if (err === 3052 || err === 1105 || err === 7 || err === 1206) continue;
  }

  if (!data) {
    throw new Error(withOfficialHint(`${cfg.label}登录无响应`, input.platform));
  }

  const sessionId =
    sess.jar.get("sessionid") ||
    sess.jar.get("sessionid_ss") ||
    sess.jar.get("sid_tt") ||
    undefined;

  const ok =
    data.message === "success" ||
    Boolean(sessionId) ||
    data.data?.error_code === 0;

  if (!ok) {
    throw new Error(
      withOfficialHint(
        mapPassportError(
          data.data?.error_code,
          data.data?.description,
          input.platform,
        ) + `（${cfg.label}直连 · 已注册登录）`,
        input.platform,
      ),
    );
  }

  if (!sessionId) {
    throw new Error(`${cfg.label}登录成功但未返回 sessionid`);
  }

  sessions.delete(key);

  return {
    sessionId,
    label: `${cfg.label} ${phone.slice(0, 3)}****${phone.slice(-4)}`,
  };
}

/** 用 sessionid 探测官网登录是否仍有效（豆包 / 即梦 / 小云雀） */
export async function checkPassportSession(input: {
  platform: AuthPlatform;
  sessionId: string;
}): Promise<{ ok: boolean; message: string; name?: string; ms: number }> {
  const cfg = PASSPORT_CONFIG[input.platform];
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    return { ok: false, message: "缺少 sessionid", ms: 0 };
  }

  const started = Date.now();
  const cookie = `sessionid=${sessionId}; sessionid_ss=${sessionId}`;
  const url = `${cfg.origin}/passport/account/info/v2/?aid=${cfg.aid}&account_sdk_source=web&sdk_version=2.1.0&language=zh`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        Cookie: cookie,
        Origin: cfg.origin,
        Referer: `${cfg.origin}/`,
        "User-Agent": UA,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const ms = Date.now() - started;
    let data: {
      message?: string;
      data?: { name?: string; user_id?: string | number; screen_name?: string };
    } = {};
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        message: `${cfg.label}响应异常: ${text.slice(0, 120)}`,
        ms,
      };
    }

    const name =
      data.data?.name ||
      data.data?.screen_name ||
      (data.data?.user_id ? String(data.data.user_id) : "");

    if (res.ok && (data.message === "success" || data.data?.user_id)) {
      return {
        ok: true,
        message: `${cfg.label}已注册登录有效${name ? ` · ${name}` : ""} · ${ms}ms`,
        name,
        ms,
      };
    }

    return {
      ok: false,
      message:
        data.message && data.message !== "success"
          ? `${cfg.label} session 失效: ${data.message}`
          : `${cfg.label}鉴权失败 HTTP ${res.status}`,
      ms,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "检测失败",
      ms: Date.now() - started,
    };
  }
}
