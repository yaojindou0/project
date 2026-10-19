/**
 * 安卓开发代理：校验豆包 session（对齐 PC auth/check-session 语义）。
 */

import { digits, pickDoubaoAccount, uuid } from "./doubao-chat.mjs";

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
  const account = pickDoubaoAccount(body?.settings);
  const sessionId = String(
    account?.sessionId || body?.sessionId || body?.settings?.doubaoSessionId || "",
  ).trim();
  const cookieHeader = String(
    account?.cookie || body?.cookie || body?.settings?.doubaoCookie || "",
  ).trim();
  if (!sessionId) {
    return { ok: false, error: "缺少 session" };
  }
  const cookie =
    cookieHeader || `sessionid=${sessionId}; sessionid_ss=${sessionId}`;
  const profile = profileOf(sessionId);
  const target = new URL(checkUrl);
  const qs = new URLSearchParams({
    aid: "497858",
    account_sdk_source: "web",
    sdk_version: "2.1.7",
    language: "zh",
    verifyFp: profile.fp,
    fp: profile.fp,
    msToken: digits(32),
    a_bogus: uuid().replace(/-/g, ""),
  });
  target.search = target.search ? `${target.search}&${qs}` : `?${qs}`;

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
      data = { raw: text.slice(0, 200) };
    }
    const ok =
      res.ok &&
      (data?.data?.user_id ||
        data?.data?.name ||
        data?.user_id ||
        data?.message === "success" ||
        Number(data?.error_code) === 0);
    return {
      ok: Boolean(ok),
      status: res.status,
      data,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "校验失败" };
  }
}
