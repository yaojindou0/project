/**
 * 豆包网页 Seedream 生图（skill_type=3 / content_type=2009），对齐 PC doubaoWebGenerateImage。
 */

import https from "node:https";
import http from "node:http";
import {
  digits,
  pickDoubaoAccount,
  resolveDoubaoCookie,
  uuid,
} from "./doubao-chat.mjs";
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
  if (!/^https?:\/\//i.test(u)) return false;
  if (/samantha|passport|completion|account\/info/i.test(u)) return false;
  return (
    /\.(png|jpe?g|webp|gif|bmp|avif)(\?|$|~)/i.test(u) ||
    /tplv|byteimg|imagex|douyinpic|ivolces|rc_gen_image|tos-cn-i-/i.test(u)
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

function pickImageUrl(item) {
  if (!item || typeof item !== "object") return "";
  const nested = (key) => {
    const o = item[key];
    if (o && typeof o === "object" && typeof o.url === "string") return o.url;
    return "";
  };
  return (
    nested("image_ori") ||
    nested("image_raw") ||
    nested("image_preview") ||
    nested("image_thumb") ||
    (typeof item.url === "string" ? item.url : "") ||
    (typeof item.image_url === "string" ? item.image_url : "")
  );
}

function pushUrl(urls, u) {
  const cleaned = cleanImageUrl(u);
  if (looksLikeImageUrl(cleaned) && !urls.includes(cleaned)) urls.push(cleaned);
}

function parseImageUrls(raw) {
  throwIfRate(raw);
  const urls = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trimStart();
    if (!data || data === "[DONE]") continue;
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    let inner = ev.event_data;
    if (typeof inner === "string") {
      try {
        inner = JSON.parse(inner);
      } catch {
        inner = null;
      }
    }
    const msg = inner?.message;
    if (msg?.content) {
      try {
        const payload = JSON.parse(msg.content);
        const ct = Number(msg.content_type);
        if (ct === 2010) {
          const list = Array.isArray(payload.data)
            ? payload.data
            : payload.data
              ? [payload.data]
              : Array.isArray(payload.images)
                ? payload.images
                : [];
          for (const item of list) pushUrl(urls, pickImageUrl(item));
        } else if (ct === 2074) {
          for (const c of payload.creations || []) {
            pushUrl(urls, pickImageUrl(c?.image || c));
          }
        } else {
          collectUrlsDeep(payload, urls);
        }
      } catch {
        collectUrlsDeep(msg.content, urls);
      }
    }
    if (inner) collectUrlsDeep(inner, urls);
  }
  if (!urls.length) {
    const text = String(raw)
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&");
    collectUrlsDeep(text, urls);
  }
  return urls.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
}

function cleanImageUrl(u) {
  return String(u || "")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\+$/g, "")
    .trim();
}

function sniffImage(buf, ct) {
  if (!buf || buf.length < 32) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  const brand = buf.length > 16 ? buf.subarray(4, 12).toString("ascii") : "";
  if (/ftyp/.test(brand)) return "image/avif";
  const type = String(ct || "").toLowerCase().split(";")[0].trim();
  if (type.startsWith("image/") && !type.includes("svg")) return type;
  return null;
}

function upgradeByteimgUrl(u) {
  const out = [u];
  const m = u.match(/^(https?:\/\/[^?]+?)~tplv-[^?]+\.(?:png|jpe?g|webp|avif)(\?.*)?$/i);
  if (m) {
    const bare = m[1] + (m[2] || "");
    if (!out.includes(bare)) out.push(bare);
    const ori = `${m[1]}~tplv-a9rns2rl98-image.jpeg${m[2] || ""}`;
    if (!out.includes(ori)) out.push(ori);
  }
  return out;
}

function requestImage(url, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http:") ? http : https;
    const req = lib.get(url, { headers, timeout: 60_000 }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirects < 4) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        requestImage(next, headers, redirects + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status,
          ct: String(res.headers["content-type"] || ""),
          buf: Buffer.concat(chunks),
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("拉图超时")));
    req.on("error", reject);
  });
}

async function fetchImageBytes(url, sessionId, cookieHeader) {
  const headerSets = [
    {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: `${BASE}/`,
      "User-Agent": FAKE_HEADERS["User-Agent"],
    },
    {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: `${BASE}/chat/`,
      "User-Agent": FAKE_HEADERS["User-Agent"],
    },
    {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: `${BASE}/chat/`,
      Cookie: cookieFor(sessionId, cookieHeader),
      "User-Agent": FAKE_HEADERS["User-Agent"],
    },
  ];
  let last = "无响应";
  for (const headers of headerSets) {
    try {
      const res = await requestImage(url, headers);
      const mime = res.status >= 200 && res.status < 300 ? sniffImage(res.buf, res.ct) : null;
      if (mime) return { buf: res.buf, mime };
      let host = "bad-url";
      try {
        host = new URL(url).host;
      } catch {
        /* keep */
      }
      const signed = /x-signature=|sign=/i.test(url) ? "有签名" : "无签名";
      last = `HTTP ${res.status} ${res.ct || "无类型"} ${host} ${signed} ${res.buf.length}B`;
    } catch (e) {
      last = e instanceof Error ? e.message : "请求失败";
    }
  }
  return { error: last };
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

/** 依次尝试全部图链，落盘为同源 /tmp-media/:id */
async function materialize(sessionId, cookieHeader, urls) {
  const list = [];
  for (const raw of urls) {
    const cleaned = cleanImageUrl(raw);
    if (!looksLikeImageUrl(cleaned)) continue;
    for (const u of upgradeByteimgUrl(cleaned)) {
      if (!list.includes(u)) list.push(u);
    }
  }
  list.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
  let last = "没有可拉取的图片地址";
  for (const url of list.slice(0, 8)) {
    const got = await fetchImageBytes(url, sessionId, cookieHeader);
    if (got.buf) return putTmpMedia(got.buf, got.mime);
    last = got.error || last;
  }
  throw new Error(`豆包图片拉取失败（${last}）。请再试一次`);
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

  if (!urls.length) {
    throw new Error(
      `豆包网页生图未返回图片（上游 ${raw.length} 字：${raw.replace(/\s+/g, " ").slice(0, 140)}）`,
    );
  }
  const imageUrl = await materialize(sid, cookieHeader, urls);
  return { imageUrl, model: "seedream-4.5:web" };
}

export function resolveImageAuth(settings) {
  const arkKey = String(settings?.arkApiKey || settings?.doubaoApiKey || "").trim();
  const account = pickDoubaoAccount(settings);
  const sessionId = String(
    account?.sessionId || settings?.doubaoSessionId || "",
  ).trim();
  const cookieHeader = resolveDoubaoCookie(account, settings);
  return { arkKey, sessionId, cookieHeader };
}
