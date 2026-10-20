/**
 * 安卓开发代理：校验豆包 session（对齐 PC /api/auth/check-session 返回形态）。
 */

import { digits, uuid } from "./doubao-chat.mjs";

function hashHex(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  const s = `doubao-web:${text}`;
  for (let i = 0; i < s.length; i += 1) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= s.charCodeAt(s.length - 1 - i);
    h2 = Math.imul(h2, 0x01000193);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}${a}${b}`;
}

function profileOf(sessionId) {
  const hash = hashHex(sessionId.trim());
  const num = String(parseInt(hash.slice(0, 12), 16) || 1)
    .padStart(18, "0")
    .slice(0, 18);
  const web = String(parseInt(hash.slice(12, 24), 16) || 2)
    .padStart(18, "0")
    .slice(0, 18);
  return {
    deviceId: `7${num}`,
    webId: `7${web}`,
    fp: `verify_${hash.slice(0, 8)}_${hash.slice(8, 16)}`,
  };
}

export async function runAuthCheckUpstream(body, checkUrl) {
  const sessionId = String(body?.sessionId || "").trim();
  const cookieHeader = String(body?.cookie || body?.cookieHeader || "").trim();
  const platform = String(body?.platform || "doubao");
  const label = String(body?.label || "").trim();

  if (!sessionId) {
    return { ok: false, error: "缺少 sessionid" };
  }

  const cookie =
    cookieHeader || `sessionid=${sessionId}; sessionid_ss=${sessionId}`;
  const profile = profileOf(sessionId);
  const target = new URL(checkUrl);
  const qs = new URLSearchParams({
    aid: platform === "doubao" ? "497858" : "513695",
    account_sdk_source: "web",
    sdk_version: "2.1.7",
    language: "zh",
    verifyFp: profile.fp,
    fp: profile.fp,
    msToken: digits(32),
    a_bogus: uuid().replace(/-/g, ""),
  });
  target.search = target.search ? `${target.search}&${qs}` : `?${qs}`;

  const started = Date.now();
  try {
    const res = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: cookie,
        Origin: target.origin,
        Referer: `${target.origin}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    const errCode = Number(data?.error_code ?? data?.code ?? NaN);
    const desc = String(
      data?.description || data?.message || data?.error || "",
    );
    const nameRaw =
      data?.data?.name ||
      data?.data?.user_name ||
      data?.data?.screen_name ||
      "";
    const name =
      typeof nameRaw === "string" && !/error|invalid|fail/i.test(nameRaw)
        ? nameRaw
        : "";
    const userId = data?.data?.user_id || data?.user_id;
    const looksFail =
      !res.ok ||
      (Number.isFinite(errCode) && errCode !== 0) ||
      /error|invalid|过期|失效|未登录/i.test(desc) ||
      /error|invalid/i.test(String(nameRaw));
    const ok = !looksFail && Boolean(userId || name);

    if (!ok) {
      return {
        ok: false,
        error:
          desc ||
          (Number.isFinite(errCode) ? `error_code=${errCode}` : "") ||
          `session 无效或已过期（HTTP ${res.status}）`,
        ms: Date.now() - started,
        platform,
      };
    }

    const baseMsg = name ? `已验证：${name}` : "session 有效";
    return {
      ok: true,
      message: label ? `${baseMsg} · ${label}` : baseMsg,
      name: name || undefined,
      ms: Date.now() - started,
      platform,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "校验失败",
      ms: Date.now() - started,
      platform,
    };
  }
}
