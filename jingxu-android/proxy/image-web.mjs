/**
 * 豆包网页 Seedream 生图（skill_type=3 / content_type=2009），对齐 PC doubaoWebGenerateImage。
 */

import { digits, pickDoubaoAccount, uuid } from "./doubao-chat.mjs";
import { putTmpMedia } from "./tmp-media.mjs";

const SKILL_AID = "582478";
const BASE = "https://www.doubao.com";

const FAKE_HEADERS = {
  Accept: "text/event-stream",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: BASE,
  Referer: `${BASE}/chat/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  "Agw-Js-Conv": "str",
};

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

function queryOf(profile) {
  return new URLSearchParams({
    aid: SKILL_AID,
    real_aid: SKILL_AID,
    device_id: profile.deviceId,
    tea_uuid: profile.deviceId,
    web_id: profile.webId,
    device_platform: "web",
    language: "zh",
    region: "CN",
    sys_region: "CN",
    pkg_type: "release_version",
    version_code: "20800",
    pc_version: "2.1.7",
    chromium_version: "130.0.6723.137",
    client_platform: "pc_client",
    runtime: "web",
    runtime_version: "3.5.4",
    samantha_web: "1",
    "use-olympus-account": "1",
    fp: profile.fp,
    web_tab_id: uuid(),
  }).toString();
}

function cookieFor(sessionId, cookieHeader) {
  return (
    String(cookieHeader || "").trim() ||
    `sessionid=${sessionId}; sessionid_ss=${sessionId}`
  );
}

function throwIfRate(raw) {
  if (/71002200[24]|rate limited|访问过于频繁|访问频繁/i.test(raw)) {
    const m = String(raw).match(/71002200[24]/);
    throw new Error(
      `豆包访问过于频繁（${m?.[0] || "限流"}）：请等待 2–3 分钟后再试，勿连续点击`,
    );
  }
}

function looksLikeImageUrl(u) {
  return (
    /^https?:\/\//i.test(u) &&
    (/\.(png|jpe?g|webp|gif|bmp)(\?|$|~)/i.test(u) ||
      /tplv|~tplv|image|byteimg|imagex|douyinpic|snssdk|ivolces|doubao|rc_gen_image/i.test(
        u,
      ))
  );
}

function scoreImageUrl(u) {
  let s = 0;
  if (/image_ori|\/ori\/|origin/i.test(u)) s += 50;
  if (/image_raw|\/raw\//i.test(u)) s += 45;
  if (/x-signature=|X-Amz-Signature=|sign=/i.test(u)) s += 40;
  if (/preview|thumb|cthumb|othumb|resize/i.test(u)) s -= 30;
  s += Math.min(30, Math.floor(u.length / 40));
  return s;
}

function collectUrlsDeep(node, out, depth = 0) {
  if (depth > 12 || node == null) return;
  if (typeof node === "string") {
    if (looksLikeImageUrl(node) && !out.includes(node)) out.push(node);
    for (const m of node.matchAll(
      /https?:\/\/[^\s"'\\<>]+?(?:byteimg|imagex|douyinpic|doubao|ivolces|snssdk)[^\s"'\\<>]*/gi,
    )) {
      const u = m[0].replace(/[),.;]+$/, "");
      if (looksLikeImageUrl(u) && !out.includes(u)) out.push(u);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectUrlsDeep(x, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && /url|uri|src/i.test(k) && looksLikeImageUrl(v)) {
        if (/ori|raw|origin/i.test(k)) {
          if (!out.includes(v)) out.unshift(v);
        } else if (!out.includes(v)) out.push(v);
      }
      collectUrlsDeep(v, out, depth + 1);
    }
  }
}

function parseImageUrls(raw) {
  throwIfRate(raw);
  const urls = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trimStart();
    if (!data || data === "[DONE]") continue;
    try {
      const ev = JSON.parse(data);
      let inner = ev.event_data;
      if (typeof inner === "string") {
        try {
          inner = JSON.parse(inner);
        } catch {
          collectUrlsDeep(inner, urls);
          continue;
        }
      }
      if (inner) collectUrlsDeep(inner, urls);
      collectUrlsDeep(ev, urls);
    } catch {
      collectUrlsDeep(data, urls);
    }
  }
  // 整包兜底
  collectUrlsDeep(raw, urls);
  return urls;
}

function pickBestImageUrl(urls) {
  const expanded = [];
  for (const u of urls) {
    const cleaned = u
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/\\\//g, "/")
      .trim();
    if (!looksLikeImageUrl(cleaned)) continue;
    if (!expanded.includes(cleaned)) expanded.push(cleaned);
  }
  if (!expanded.length) return undefined;
  expanded.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
  return expanded[0];
}

function extractAsyncTaskId(raw) {
  throwIfRate(raw);
  const patterns = [
    /"async_task"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/,
    /"async_task"\s*:\s*\{[^}]*?"id"\s*:\s*"([^"]+)"/,
    /"task_id"\s*:\s*"([a-fA-F0-9-]{8,})"/,
  ];
  const unescaped = String(raw)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  for (const src of [raw, unescaped]) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

async function postSkill(sessionId, cookieHeader, body, timeoutMs) {
  const profile = profileOf(sessionId);
  const qs = queryOf(profile);
  const res = await fetch(`${BASE}/samantha/chat/completion?${qs}`, {
    method: "POST",
    headers: {
      ...FAKE_HEADERS,
      Cookie: cookieFor(sessionId, cookieHeader),
      "X-Flow-Trace": `04-${uuid()}-${uuid().slice(0, 16)}-01`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`豆包网页生图失败: ${res.status} ${text.slice(0, 200)}`);
  }
  throwIfRate(text);
  return text;
}

async function pollAsync(sessionId, cookieHeader, taskId, timeoutMs) {
  const profile = profileOf(sessionId);
  const qs = new URLSearchParams(queryOf(profile));
  const res = await fetch(`${BASE}/samantha/chat/async/stream?${qs}`, {
    method: "POST",
    headers: {
      ...FAKE_HEADERS,
      Cookie: cookieFor(sessionId, cookieHeader),
    },
    body: JSON.stringify({ task_id: taskId, event_id: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`豆包异步轮询失败: ${res.status} ${text.slice(0, 200)}`);
  }
  throwIfRate(text);
  return text;
}

/** 带 Cookie 拉图转 data URL，避免 H5 防盗链空白；过大则退回原链 */
async function materialize(sessionId, cookieHeader, remoteUrl) {
  try {
    const res = await fetch(remoteUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: `${BASE}/chat/`,
        Cookie: cookieFor(sessionId, cookieHeader),
        "User-Agent": FAKE_HEADERS["User-Agent"],
      },
      signal: AbortSignal.timeout(60_000),
      redirect: "follow",
    });
    if (!res.ok) return remoteUrl;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("json") || ct.includes("text/html")) return remoteUrl;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64 || buf.length > 3_500_000) return remoteUrl;
    const head = buf.subarray(0, 4);
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    const isPng =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp =
      buf.length > 12 &&
      buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      buf.subarray(8, 12).toString("ascii") === "WEBP";
    if (!isJpeg && !isPng && !isWebp) return remoteUrl;
    const mime = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return remoteUrl;
  }
}

export async function doubaoWebGenerateImage({
  sessionId,
  cookieHeader,
  prompt,
  ratio = "16:9",
  timeoutMs = 150_000,
}) {
  const sid = String(sessionId || "").trim();
  if (!sid) throw new Error("缺少豆包网页 session");

  const content = { text: prompt };
  if (ratio) content.ratio = ratio;

  const raw = await postSkill(
    sid,
    cookieHeader,
    {
      messages: [
        {
          content: JSON.stringify(content),
          content_type: 2009,
          attachments: [],
          references: [],
          skill: {
            skill_type: 3,
            skill_type_no_default: 3,
            skill_id: "3",
            skill_id_no_default: "3",
          },
        },
      ],
      completion_option: {
        is_regen: false,
        with_suggest: true,
        need_create_conversation: true,
        launch_stage: 1,
        is_replace: false,
        is_delete: false,
        is_ai_playground: false,
        memory_type: 2,
        message_from: 0,
        use_deep_think: false,
        use_auto_cot: false,
        resend_for_regen: false,
        enable_commerce_credit: false,
        action_bar_skill_id: 3,
      },
      evaluate_option: { web_ab_params: "" },
      local_conversation_id: uuid(),
      local_message_id: uuid(),
      section_id: `26${digits(16)}`,
      conversation_id: "0",
    },
    Math.min(timeoutMs, 150_000),
  );

  let urls = parseImageUrls(raw);
  if (!urls.length) {
    const taskId = extractAsyncTaskId(raw);
    if (taskId) {
      const polled = await pollAsync(sid, cookieHeader, taskId, timeoutMs);
      urls = parseImageUrls(polled);
      if (!urls.length) urls = parseImageUrls(`${raw}\n${polled}`);
    }
  }

  const best = pickBestImageUrl(urls);
  if (!best) {
    throw new Error(
      `豆包网页生图未返回图片（上游 ${raw.length} 字：${raw.replace(/\s+/g, " ").slice(0, 140)}）`,
    );
  }
  const imageUrl = await materialize(sid, cookieHeader, best);
  return { imageUrl, model: "seedream-4.5:web" };
}

export function resolveImageAuth(settings) {
  const arkKey = String(settings?.arkApiKey || settings?.doubaoApiKey || "").trim();
  const account = pickDoubaoAccount(settings);
  const sessionId = String(
    account?.sessionId || settings?.doubaoSessionId || "",
  ).trim();
  const cookieHeader = String(
    account?.cookie || settings?.doubaoCookie || "",
  ).trim();
  return { arkKey, sessionId, cookieHeader };
}
