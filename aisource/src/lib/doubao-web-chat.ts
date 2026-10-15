import "server-only";

import { createHash, randomUUID } from "crypto";
import { jsonrepair } from "jsonrepair";
import { putTmpMedia } from "./tmp-media";
import { withGenerateVideoPrefix } from "./video-prompt";

/** 网页对话 Agent */
const CHAT_AID = "497858";
/** 技能接口（生图/视频）— 与官网 samantha 一致 */
const SKILL_AID = "582478";
const VERSION_CODE = "20800";
/** 对齐 doubao2api / 桌面网页客户端 */
const PC_VERSION = "2.1.7";
const RUNTIME_VERSION = "3.5.4";
const CHROMIUM_BUILD = "130.0.6723.137";
const BASE = "https://www.doubao.com";

const FAKE_HEADERS: Record<string, string> = {
  Accept: "text/event-stream",
  "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  Origin: BASE,
  Pragma: "no-cache",
  Priority: "u=1, i",
  Referer: `${BASE}/chat/`,
  "Sec-Ch-Ua":
    '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

/** 每个 session 固定设备指纹，避免每次随机触发风控 */
type DeviceProfile = {
  deviceId: string;
  webId: string;
  fp: string;
  lastRequestAt: number;
};

const deviceProfiles = new Map<string, DeviceProfile>();
/** sessionId → 完整 Cookie（可含官网粘贴的 ttwid/msToken 等） */
const sessionCookieJars = new Map<string, string>();

function digits(len: number) {
  let s = "";
  while (s.length < len) {
    s += Math.floor(Math.random() * 1e10)
      .toString()
      .padStart(10, "0");
  }
  return s.slice(0, len);
}

function stableProfile(sessionId: string): DeviceProfile {
  const key = sessionId.trim();
  let p = deviceProfiles.get(key);
  if (p) return p;
  const hash = createHash("sha256").update(`doubao-web:${key}`).digest("hex");
  // 官网常见 device_id 形态：7 + 18 位数字
  const num = BigInt("0x" + hash.slice(0, 15)).toString().padStart(18, "0").slice(0, 18);
  p = {
    deviceId: `7${num}`,
    webId: `7${BigInt("0x" + hash.slice(15, 30)).toString().padStart(18, "0").slice(0, 18)}`,
    fp: `verify_${hash.slice(0, 8)}_${hash.slice(8, 16)}`,
    lastRequestAt: 0,
  };
  deviceProfiles.set(key, p);
  return p;
}

function parseCookiePairs(header: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const name = t.slice(0, i).trim();
    if (!name) continue;
    map.set(name.toLowerCase(), `${name}=${t.slice(i + 1).trim()}`);
  }
  return map;
}

function cookieHeaderFromMap(map: Map<string, string>) {
  return [...map.values()].join("; ");
}

/** 写入/合并 Cookie 罐；视频技能对鉴权比生图更敏感 */
export function seedDoubaoWebCookies(
  sessionId: string,
  cookieHeader?: string | null,
) {
  const sid = sessionId.trim();
  if (!sid) return;
  const map = parseCookiePairs(cookieHeader || "");
  if (!map.has("sessionid")) map.set("sessionid", `sessionid=${sid}`);
  if (!map.has("sessionid_ss")) map.set("sessionid_ss", `sessionid_ss=${sid}`);
  sessionCookieJars.set(sid, cookieHeaderFromMap(map));
}

function mergeSetCookiesIntoJar(sessionId: string, setCookies: string[]) {
  const sid = sessionId.trim();
  if (!sid || !setCookies.length) return;
  const map = parseCookiePairs(cookieFor(sid));
  for (const raw of setCookies) {
    const first = raw.split(";")[0]?.trim();
    if (!first || !first.includes("=")) continue;
    const name = first.slice(0, first.indexOf("=")).trim().toLowerCase();
    if (!name) continue;
    map.set(name, first);
  }
  if (!map.has("sessionid")) map.set("sessionid", `sessionid=${sid}`);
  if (!map.has("sessionid_ss")) map.set("sessionid_ss", `sessionid_ss=${sid}`);
  sessionCookieJars.set(sid, cookieHeaderFromMap(map));
}

function cookieFor(sessionId: string) {
  const s = sessionId.trim();
  const jar = sessionCookieJars.get(s);
  if (jar) return jar;
  // 与浏览器登录后一致：双写 sessionid / sessionid_ss
  return `sessionid=${s}; sessionid_ss=${s}`;
}

/**
 * 对齐官网 / doubao2api 安全查询参数。
 * 切勿塞假 msToken——空/伪造 msToken 是 710022002 主因之一。
 */
function queryParams(aid: string, profile: DeviceProfile) {
  return new URLSearchParams({
    aid,
    real_aid: aid,
    device_id: profile.deviceId,
    tea_uuid: profile.deviceId,
    web_id: profile.webId,
    device_platform: "web",
    language: "zh",
    region: "CN",
    sys_region: "CN",
    pkg_type: "release_version",
    version_code: VERSION_CODE,
    pc_version: PC_VERSION,
    chromium_version: CHROMIUM_BUILD,
    client_platform: "pc_client",
    runtime: "web",
    runtime_version: RUNTIME_VERSION,
    samantha_web: "1",
    "use-olympus-account": "1",
    fp: profile.fp,
    web_tab_id: randomUUID(),
  });
}

function commonHeaders(sessionId: string, extra?: Record<string, string>) {
  return {
    ...FAKE_HEADERS,
    Cookie: cookieFor(sessionId),
    "Content-Type": "application/json",
    // 官网技能接口只用这一种
    "Agw-Js-Conv": "str",
    "X-Flow-Trace": `04-${randomUUID()}-${randomUUID().slice(0, 16)}-01`,
    ...extra,
  };
}

/** 官网 skill completion_option（生图/视频 with_suggest=true，无 event_id） */
function skillCompletionOption(skillId: number) {
  return {
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
    action_bar_skill_id: skillId,
  };
}

/** 普通对话（分镜）completion_option，无 skill */
function chatCompletionOption() {
  return {
    is_regen: false,
    with_suggest: false,
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
  };
}

type SseEvent = {
  event_type?: number;
  event_data?: string | Record<string, unknown>;
  code?: number;
  message?: string;
};

function parseSseRaw(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  // 逐行解析：豆包偶发「无空行分隔的多条 data:」，按块 join 会毁掉 JSON
  let eventName = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) {
      eventName = "";
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trimStart();
    if (!data || data === "[DONE]") continue;
    if (eventName === "gateway-error") {
      try {
        const err = JSON.parse(data) as {
          code?: string | number;
          message?: string;
        };
        throw new Error(
          `豆包网关错误: ${err.code || ""} ${err.message || data}`.trim(),
        );
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("豆包网关")) throw e;
        throw new Error(`豆包网关错误: ${data.slice(0, 240)}`);
      }
    }
    try {
      events.push(JSON.parse(data) as SseEvent);
    } catch {
      /* skip broken line */
    }
    // 每条 data 独立成事件后复位 event 名，避免串台
    eventName = "";
  }
  return events;
}

/** 宽松取出 event_data（不强制 event_type=2001） */
function looseEventData(ev: SseEvent): Record<string, unknown> | null {
  if (ev.event_data == null) return null;
  try {
    if (typeof ev.event_data === "string") {
      return JSON.parse(ev.event_data) as Record<string, unknown>;
    }
    if (typeof ev.event_data === "object") {
      return ev.event_data as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function eventInner(ev: SseEvent): Record<string, unknown> | null {
  if (typeof ev.code === "number" && ev.code !== 0) {
    throw new Error(`豆包网页接口失败: ${ev.code}-${String(ev.message || "")}`);
  }
  const et = asNum(ev.event_type);

  // STREAM_ERROR / 风控（常见 710022002 访问频繁、710022004 滑块）
  if (et === 2006 || et === 2005) {
    const raw = ev.event_data;
    const text =
      typeof raw === "string" ? raw : JSON.stringify(raw || ev.message || "");
    const rate = text.match(/71002200[24]/);
    if (rate || /访问频繁|稍后再试|block/i.test(text)) {
      throw new Error(
        `豆包访问过于频繁（${rate?.[0] || "限流"}）：请等待 2–3 分钟后再试，勿连续点击`,
      );
    }
    throw new Error(`豆包网页接口错误: ${text.slice(0, 240)}`);
  }
  if (et !== 2001) return null;
  try {
    const ed =
      typeof ev.event_data === "string"
        ? (JSON.parse(ev.event_data) as Record<string, unknown>)
        : (ev.event_data as Record<string, unknown>);
    return ed || null;
  } catch {
    return null;
  }
}

async function throttle(sessionId: string) {
  const p = stableProfile(sessionId);
  const gap = 1600 + Math.floor(Math.random() * 400);
  const wait = p.lastRequestAt + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  p.lastRequestAt = Date.now();
}

async function postSamantha(
  sessionId: string,
  aid: string,
  body: unknown,
  timeoutMs: number,
): Promise<string> {
  await throttle(sessionId);
  const profile = stableProfile(sessionId);
  const qs = queryParams(aid, profile);
  const res = await fetch(`${BASE}/samantha/chat/completion?${qs}`, {
    method: "POST",
    headers: commonHeaders(sessionId),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`豆包网页请求失败: ${res.status} ${text.slice(0, 240)}`);
  }
  // 非 SSE：可能是登录过期 JSON
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream") && text.trim().startsWith("{")) {
    try {
      const err = JSON.parse(text) as {
        code?: number;
        msg?: string;
        message?: string;
      };
      if (err.code && err.code !== 0) {
        throw new Error(
          `豆包网页接口失败: ${err.code}-${err.msg || err.message || ""}`,
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("豆包网页接口失败")) throw e;
    }
  }
  return text;
}

function mergePrompt(system: string, user: string) {
  // 官网对话多为单条 user；把系统约束前置到同一条，避免 ChatML 标签干扰输出
  return `${system}\n\n---\n${user}\n\n请现在只输出 JSON 对象：`;
}

/** 从设置中取已启用的豆包网页 sessionid */
export {
  hasDoubaoWebSession,
  resolveDoubaoWebSession,
} from "./doubao-session";

/**
 * 文本对话（分镜等）→ /samantha/chat/completion
 * keepThread=true 时保留 conversationId 供前端继续回复
 */
export async function doubaoWebChatText(input: {
  sessionId: string;
  system?: string;
  user: string;
  conversationId?: string;
  /** 默认删除临时会话；视频对话面板续聊时传 true */
  keepThread?: boolean;
}): Promise<{ text: string; conversationId: string }> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) throw new Error("缺少豆包网页 sessionid");

  const textBody = input.system?.trim()
    ? mergePrompt(input.system, input.user)
    : input.user;
  const existingConv = input.conversationId?.trim();
  const needCreate = !existingConv || existingConv === "0";

  const raw = await postSamantha(
    sessionId,
    CHAT_AID,
    {
      messages: [
        {
          content: JSON.stringify({ text: textBody }),
          content_type: 2001,
          attachments: [],
          references: [],
        },
      ],
      completion_option: {
        ...chatCompletionOption(),
        need_create_conversation: needCreate,
      },
      evaluate_option: { web_ab_params: "" },
      section_id: `26${digits(16)}`,
      conversation_id: needCreate ? "0" : existingConv,
      local_conversation_id: needCreate
        ? `local_16${digits(14)}`
        : `local_${existingConv.slice(0, 16)}`,
      local_message_id: randomUUID(),
    },
    180_000,
  );

  const parsed = extractSseAssistantChat(raw);
  let conversationId = parsed.conversationId || existingConv || "";
  const content = parsed.text;

  if (!input.keepThread && conversationId) {
    void deleteThread(sessionId, conversationId);
  }
  if (!content.trim()) throw new Error("豆包网页对话返回为空");
  return {
    text: content.replace(/\n$/, ""),
    conversationId: conversationId || "0",
  };
}

/** 从 SSE 抽出助手全文 + conversation_id（视频聊天回退 / 续聊共用） */
export function extractSseAssistantChat(raw: string): {
  text: string;
  conversationId: string;
} {
  let content = "";
  let conversationId = "";

  const absorbChunk = (chunk: string) => {
    if (!chunk) return;
    if (
      !content ||
      (chunk.length >= content.length && chunk.startsWith(content))
    ) {
      content = chunk;
    } else if (content.endsWith(chunk)) {
      /* dup */
    } else {
      content += chunk;
    }
  };

  const walkBlocks = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const block = b as Record<string, unknown>;
      const c = block.content as Record<string, unknown> | undefined;
      const textBlock = c?.text_block as { text?: string } | undefined;
      if (typeof textBlock?.text === "string") absorbChunk(textBlock.text);
      // content_block 偶发直接挂 text
      if (typeof (block as { text?: string }).text === "string") {
        absorbChunk((block as { text: string }).text);
      }
    }
  };

  for (const ev of parseSseRaw(raw)) {
    let inner: Record<string, unknown> | null = null;
    try {
      inner = eventInner(ev);
    } catch {
      inner = looseEventData(ev);
    }
    if (!inner) {
      // /chat/completion 的 ACK / patch 可能不在 event_type=2001
      const loose = looseEventData(ev);
      if (loose) {
        if (loose.conversation_id) {
          conversationId = String(loose.conversation_id);
        }
        walkBlocks(loose.content_block);
        const msg = loose.message as Record<string, unknown> | undefined;
        if (msg) walkBlocks(msg.content_block);
      }
      if (ev.event_type === 2003) break;
      continue;
    }
    if (inner.conversation_id) conversationId = String(inner.conversation_id);

    walkBlocks(inner.content_block);
    const patch = inner.patch_op as Record<string, unknown> | undefined;
    if (patch) walkBlocks(patch.content_block);

    const message = inner.message as
      | {
          content?: string;
          content_type?: number;
          content_block?: unknown;
        }
      | undefined;
    if (message?.content_block) walkBlocks(message.content_block);
    if (message?.content) {
      try {
        const parsed = JSON.parse(message.content) as Record<string, unknown>;
        let chunk = "";
        if (typeof parsed.text === "string") chunk = parsed.text;
        else if (
          parsed.delta &&
          typeof (parsed.delta as { text?: string }).text === "string"
        ) {
          chunk = (parsed.delta as { text: string }).text;
        } else if (typeof parsed.content === "string") {
          chunk = parsed.content;
        }
        absorbChunk(chunk);
      } catch {
        /* ignore non-json */
      }
    }
    if (inner.is_finish) break;
  }

  if (!content.trim()) {
    const hint = inspectImageResponse(raw).textHint;
    if (hint) content = hint;
  }

  // 从整包再捞 conversation_id
  if (!conversationId) {
    const m = raw.match(/"conversation_id"\s*:\s*"(\d{5,})"/);
    if (m?.[1]) conversationId = m[1];
  }

  return { text: content.trim(), conversationId };
}

async function deleteThread(sessionId: string, conversationId: string) {
  if (!conversationId || conversationId === "0") return;
  try {
    const profile = stableProfile(sessionId);
    const qs = queryParams(CHAT_AID, profile);
    await fetch(`${BASE}/samantha/thread/delete?${qs}`, {
      method: "POST",
      headers: {
        ...commonHeaders(sessionId),
        Referer: `${BASE}/chat/${conversationId}`,
      },
      body: JSON.stringify({ conversation_id: conversationId }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    /* ignore */
  }
}

/** 上传参考图，返回 uri / CDN（图生图、官网图文生视频） */
export async function doubaoWebUploadImage(
  sessionId: string,
  bytes: Uint8Array,
  filename = "image.png",
): Promise<{
  uri: string;
  cdnUrl: string;
  name: string;
  format: string;
  width: number;
  height: number;
}> {
  await throttle(sessionId);
  const profile = stableProfile(sessionId);
  const qs = queryParams(SKILL_AID, profile);
  const ext = filename.includes(".")
    ? filename.split(".").pop() || "png"
    : "png";

  const form = new FormData();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  form.append("data", new Blob([ab], { type: `image/${ext}` }), filename);
  form.append("file_type", ext);

  const uploadRes = await fetch(`${BASE}/samantha/pages/upload_image?${qs}`, {
    method: "POST",
    headers: {
      ...FAKE_HEADERS,
      Cookie: cookieFor(sessionId),
      // 勿设 Content-Type，由 FormData 边界
    },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const uploadText = await uploadRes.text();
  let uploadJson: {
    code?: number;
    msg?: string;
    data?: { uri?: string; url?: string };
  };
  try {
    uploadJson = JSON.parse(uploadText);
  } catch {
    throw new Error(`豆包上传图片失败: ${uploadText.slice(0, 200)}`);
  }
  if (!uploadRes.ok || uploadJson.code !== 0 || !uploadJson.data?.uri) {
    throw new Error(
      uploadJson.msg || `豆包上传图片失败 code=${uploadJson.code}`,
    );
  }

  const uriShort = uploadJson.data.uri;
  const uploadUrl = uploadJson.data.url || "";
  const fileRes = await fetch(`${BASE}/alice/message/get_file_url?${qs}`, {
    method: "POST",
    headers: commonHeaders(sessionId),
    body: JSON.stringify({
      uris: [uriShort],
      type: "image",
      format: ext,
      expire_second: 3600,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const fileText = await fileRes.text();
  let fileJson: {
    code?: number;
    msg?: string;
    data?: {
      file_urls?: { uri?: string; main_url?: string; url?: string }[];
    };
  };
  try {
    fileJson = JSON.parse(fileText);
  } catch {
    return {
      uri: uriShort,
      cdnUrl: uploadUrl || uriShort,
      name: filename,
      format: ext,
      width: 64,
      height: 64,
    };
  }
  const info = fileJson.data?.file_urls?.[0];
  return {
    uri: info?.uri || uriShort,
    cdnUrl: info?.main_url || info?.url || uploadUrl || uriShort,
    name: filename,
    format: ext,
    width: 64,
    height: 64,
  };
}

async function fetchImageBytes(url: string): Promise<{
  bytes: Uint8Array;
  filename: string;
} | null> {
  try {
    if (url.startsWith("data:")) {
      const m = url.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
      if (!m) return null;
      const buf = Buffer.from(m[2], "base64");
      return { bytes: new Uint8Array(buf), filename: `ref.${m[1] || "png"}` };
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/png";
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png";
    return { bytes: new Uint8Array(buf), filename: `ref.${ext}` };
  } catch {
    return null;
  }
}

/**
 * 文生图 skill_type=3 / content_type=2009 → Seedream 图
 * 默认指向 Seedream 4.5；遇 710022002 限流立即停止，不再连发加重风控
 */
export async function doubaoWebGenerateImage(input: {
  sessionId: string;
  prompt: string;
  ratio?: string;
  refImageUrl?: string;
  /** 如 doubao-seedream-4-5-251128 / seedream_4_5 */
  model?: string;
  timeoutMs?: number;
}): Promise<{ imageUrl: string; model: string }> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) throw new Error("缺少豆包网页 sessionid");
  const timeoutMs = input.timeoutMs ?? 180_000;
  const modelId =
    input.model?.trim() ||
    "doubao-seedream-4-5-251128";

  let refKey: string | undefined;
  if (input.refImageUrl) {
    const fetched = await fetchImageBytes(input.refImageUrl);
    if (fetched) {
      try {
        refKey = (
          await doubaoWebUploadImage(
            sessionId,
            fetched.bytes,
            fetched.filename,
          )
        ).uri;
      } catch {
        /* 无参考图仍可文生图 */
      }
    }
  }

  // 官网文生图 content 仅 text + ratio，勿塞 model / msToken 等非网页字段
  const content: Record<string, unknown> = { text: input.prompt };
  if (input.ratio) content.ratio = input.ratio;

  const message: Record<string, unknown> = {
    content: JSON.stringify(content),
    content_type: 2009,
    attachments: refKey
      ? [{ type: "image", key: refKey, extra: { refer_types: "overall" } }]
      : [],
    references: [],
    skill: {
      skill_type: 3,
      skill_type_no_default: 3,
      skill_id: "3",
      skill_id_no_default: "3",
    },
  };

  const raw = await postSamantha(
    sessionId,
    SKILL_AID,
    {
      messages: [message],
      completion_option: skillCompletionOption(3),
      evaluate_option: { web_ab_params: "" },
      local_conversation_id: randomUUID(),
      local_message_id: randomUUID(),
    },
    Math.min(timeoutMs, 150_000),
  );

  let urls = parseImageUrls(raw);
  if (!urls.length) {
    const taskId = extractAsyncTaskId(raw);
    if (taskId) {
      const polled = await pollAsyncSkill(sessionId, taskId, timeoutMs);
      urls = parseImageUrls(polled);
      if (!urls.length) urls = parseImageUrls(`${raw}\n${polled}`);
    }
  }

  const best = pickBestImageUrl(urls);
  if (best) {
    const dataUrl = await materializeImageUrl(sessionId, best);
    if (dataUrl) {
      return { imageUrl: dataUrl, model: `seedream-4.5:${modelId}` };
    }
    // 拉图失败时仍返回最佳远程链（前端可能因防盗链空白）
    return { imageUrl: best, model: `seedream-4.5:${modelId}` };
  }

  const debug = inspectImageResponse(raw);
  const hint =
    debug.fatalHint ||
    debug.textHint ||
    diagnoseEmptyImageResponse(raw, debug);
  const err = new Error(
    `豆包 Seedream 4.5 生图未返回图片${hint ? `（${hint}）` : ""}`,
  ) as Error & { debug?: ImageGenDebug };
  err.debug = debug;
  throw err;
}

type ImageGenDebug = {
  contentTypes: number[];
  eventTypes: number[];
  textHint: string;
  fatalHint: string;
  snippet: string;
  hasAsyncTask: boolean;
};

function looksLikeImageUrl(u: string) {
  return (
    /^https?:\/\//i.test(u) &&
    (/\.(png|jpe?g|webp|gif|bmp)(\?|$|~)/i.test(u) ||
      /tplv|~tplv|image|byteimg|imagex|douyinpic|snssdk|ivolces|doubao|rc_gen_image/i.test(
        u,
      ))
  );
}

/** 给候选图链打分：原图 / 带完整签名 / 非缩略图优先 */
function scoreImageUrl(u: string): number {
  let s = 0;
  if (/image_ori|\/ori\/|origin/i.test(u)) s += 50;
  if (/image_raw|\/raw\//i.test(u)) s += 45;
  if (/x-signature=|X-Amz-Signature=|sign=/i.test(u)) s += 40;
  if (/x-expires=/i.test(u)) s += 20;
  if (/lk3s=/.test(u) && u.includes("&")) s += 15;
  if (/preview|thumb|cthumb|othumb|resize/i.test(u)) s -= 30;
  if (/~tplv-[^/]*cthumb/i.test(u)) s -= 25;
  // 更长通常更完整（签名未截断）
  s += Math.min(30, Math.floor(u.length / 40));
  return s;
}

/** 去掉 cthumb 模板，尝试还原可访问原图路径 */
function upgradeByteimgUrl(u: string): string[] {
  const out = [u];
  // xxx.jpeg~tplv-xxx-cthumb_xxx.png?query → xxx.jpeg?query
  const m = u.match(/^(https?:\/\/[^?]+?)~tplv-[^?]+\.(?:png|jpe?g|webp)(\?.*)?$/i);
  if (m) {
    const bare = m[1] + (m[2] || "");
    if (!out.includes(bare)) out.push(bare);
    // 常见原图模板
    const ori = `${m[1]}~tplv-a9rns2rl98-image.jpeg${m[2] || ""}`;
    if (!out.includes(ori)) out.push(ori);
  }
  return out;
}

function pickBestImageUrl(urls: string[]): string | undefined {
  const expanded: string[] = [];
  for (const u of urls) {
    const cleaned = u
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/\\\//g, "/")
      .trim();
    if (!looksLikeImageUrl(cleaned)) continue;
    for (const v of upgradeByteimgUrl(cleaned)) {
      if (!expanded.includes(v)) expanded.push(v);
    }
  }
  if (!expanded.length) return undefined;
  expanded.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
  return expanded[0];
}

function collectUrlsDeep(node: unknown, out: string[], depth = 0) {
  if (depth > 12 || node == null) return;
  if (typeof node === "string") {
    if (looksLikeImageUrl(node)) {
      if (!out.includes(node)) out.push(node);
      return;
    }
    for (const m of node.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!out.includes(m[1])) out.push(m[1]);
    }
    // 勿用非贪婪截断；允许 query 里的 & = %
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
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        typeof v === "string" &&
        /url|uri|src/i.test(k) &&
        looksLikeImageUrl(v)
      ) {
        // 关键字段加权：在数组前插入
        if (/ori|raw|origin/i.test(k)) {
          if (!out.includes(v)) out.unshift(v);
        } else if (!out.includes(v)) {
          out.push(v);
        }
      }
      collectUrlsDeep(v, out, depth + 1);
    }
  }
}

function pickImageUrl(item: Record<string, unknown>): string | undefined {
  const nested = (key: string) => {
    const o = item[key];
    if (o && typeof o === "object" && typeof (o as { url?: string }).url === "string") {
      return (o as { url: string }).url;
    }
    return undefined;
  };
  return (
    nested("image_ori") ||
    nested("image_raw") ||
    nested("image_preview") ||
    nested("image_thumb") ||
    (typeof item.url === "string" ? item.url : undefined) ||
    (typeof item.image_url === "string" ? item.image_url : undefined)
  );
}

/**
 * 服务端带豆包 Referer 拉图，转成 data URL，避免浏览器防盗链空白。
 */
async function materializeImageUrl(
  sessionId: string,
  remoteUrl: string,
): Promise<string | null> {
  const candidates = upgradeByteimgUrl(
    remoteUrl.replace(/\\u0026/gi, "&").replace(/&amp;/gi, "&"),
  );
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          ...FAKE_HEADERS,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: `${BASE}/chat/`,
          Cookie: cookieFor(sessionId),
        },
        signal: AbortSignal.timeout(60_000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) continue;
      // 拒绝对方返回的 JSON/HTML 错误页
      if (ct.includes("json") || ct.includes("text/html")) continue;
      const head = buf.subarray(0, 4);
      const isJpeg = head[0] === 0xff && head[1] === 0xd8;
      const isPng =
        head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const isGif = head[0] === 0x47 && head[1] === 0x49;
      const isWebp =
        buf.length > 12 &&
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WEBP";
      if (!isJpeg && !isPng && !isGif && !isWebp) continue;
      const mime = isJpeg
        ? "image/jpeg"
        : isPng
          ? "image/png"
          : isGif
            ? "image/gif"
            : "image/webp";
      // 禁止把超大 base64 塞进 JSON（会触发 Unterminated string / 客户端解析失败）
      return putTmpMedia(buf, mime);
    } catch {
      /* try next */
    }
  }
  return null;
}

function parseImageUrls(raw: string): string[] {
  const urls: string[] = [];
  const push = (u?: string) => {
    if (u && looksLikeImageUrl(u) && !urls.includes(u)) urls.push(u);
  };

  for (const ev of parseSseRaw(raw)) {
    const et = asNum(ev.event_type);
    // VERBOSE / 其它事件里也可能夹带图片 URL
    if (et === 2001 || et === 2002 || et === 2010 || et == null) {
      try {
        if (typeof ev.event_data === "string") {
          try {
            collectUrlsDeep(JSON.parse(ev.event_data), urls);
          } catch {
            collectUrlsDeep(ev.event_data, urls);
          }
        } else if (ev.event_data) {
          collectUrlsDeep(ev.event_data, urls);
        }
      } catch {
        /* skip */
      }
    }

    let inner: Record<string, unknown> | null = null;
    try {
      inner = eventInner(ev);
    } catch {
      continue;
    }
    if (!inner) continue;
    collectUrlsDeep(inner, urls);

    const msg = inner.message as
      | { content?: string; content_type?: number | string }
      | undefined;
    if (!msg?.content) continue;
    const ct = asNum(msg.content_type);
    try {
      const payload = JSON.parse(msg.content) as Record<string, unknown>;
      if (ct === 2010) {
        const data = Array.isArray(payload.data)
          ? payload.data
          : payload.data
            ? [payload.data]
            : Array.isArray(payload.images)
              ? payload.images
              : [];
        for (const item of data) {
          if (item && typeof item === "object") {
            push(pickImageUrl(item as Record<string, unknown>));
          }
        }
      } else if (ct === 2074) {
        const creations = Array.isArray(payload.creations)
          ? payload.creations
          : [];
        for (const c of creations) {
          if (!c || typeof c !== "object") continue;
          const img = (c as { image?: Record<string, unknown> }).image;
          if (img) push(pickImageUrl(img));
        }
      } else {
        collectUrlsDeep(payload, urls);
      }
    } catch {
      collectUrlsDeep(msg.content, urls);
    }
  }

  if (!urls.length) collectUrlsDeep(raw, urls);
  // 按质量排序，避免误取 cthumb / 截断签名链
  return [...urls].sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
}

function inspectImageResponse(raw: string): ImageGenDebug {
  const contentTypes = new Set<number>();
  const eventTypes = new Set<number>();
  let textHint = "";
  let fatalHint = "";

  if (!raw.trim()) {
    return {
      contentTypes: [],
      eventTypes: [],
      textHint: "",
      fatalHint: "空响应，请重新登录豆包",
      snippet: "",
      hasAsyncTask: Boolean(extractAsyncTaskId(raw)),
    };
  }

  for (const ev of parseSseRaw(raw)) {
    const et = asNum(ev.event_type);
    if (et != null) eventTypes.add(et);
    try {
      let inner: Record<string, unknown> | null = null;
      try {
        inner = eventInner(ev);
      } catch (e) {
        if (e instanceof Error && !fatalHint) fatalHint = e.message.slice(0, 160);
      }
      if (!inner) inner = looseEventData(ev);
      if (!inner) continue;
      const msg = inner.message as
        | { content?: string; content_type?: number | string }
        | undefined;
      const ct = asNum(msg?.content_type);
      if (ct != null) contentTypes.add(ct);
      if (msg?.content) {
        try {
          const p = JSON.parse(msg.content) as {
            text?: string;
            message?: string;
            error_msg?: string;
          };
          const t = (p.text || p.message || p.error_msg || "").trim();
          if (t && !textHint) textHint = t.slice(0, 160);
        } catch {
          /* skip */
        }
      }
    } catch (e) {
      if (e instanceof Error && !fatalHint) fatalHint = e.message.slice(0, 160);
    }
  }

  const blob = `${textHint}\n${raw.slice(0, 1200)}`;
  if (!fatalHint) {
    if (/71002200[24]|访问频繁|稍后再试/.test(blob)) {
      fatalHint =
        "豆包访问过于频繁（710022002）：请等待 2–3 分钟后再试，勿连续点击";
    } else if (/登录|未登录|session.*失效|passport|授权失效/i.test(textHint)) {
      fatalHint = "session 可能失效，请在设置页重新登录豆包";
    } else if (/额度|上限|次数用尽|积分不足|credit|quota/i.test(textHint)) {
      fatalHint = "额度不足或触发限额";
    } else if (/过载|繁忙|排队/.test(textHint)) {
      fatalHint = "服务繁忙，请稍后重试";
    } else if (/敏感|违规|无法生成|不支持/.test(textHint)) {
      fatalHint = textHint.slice(0, 80);
    }
  }

  return {
    contentTypes: [...contentTypes],
    eventTypes: [...eventTypes],
    textHint,
    fatalHint,
    snippet: raw.replace(/\s+/g, " ").slice(0, 220),
    hasAsyncTask: Boolean(extractAsyncTaskId(raw)),
  };
}

function diagnoseEmptyImageResponse(
  raw: string,
  debug?: ImageGenDebug | null,
): string {
  if (debug?.fatalHint) return debug.fatalHint;
  if (debug?.textHint) return debug.textHint.slice(0, 100);
  if (debug?.contentTypes.length) {
    return `收到 content_type=${debug.contentTypes.join(",")}${
      debug.hasAsyncTask ? " · 有异步任务但未解析到图" : ""
    }`;
  }
  if (!raw.trim()) return "空响应，请重新登录豆包";
  return `响应片段: ${raw.replace(/\s+/g, " ").slice(0, 120)}`;
}

function pickTaskId(node: unknown, depth = 0): string | null {
  if (depth > 8 || node == null) return null;
  if (typeof node === "string") {
    const m = node.match(
      /"async_task"\s*:\s*\{[^}]*"id"\s*:\s*"([^"]+)"/,
    );
    return m?.[1] || null;
  }
  if (typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const id = pickTaskId(x, depth + 1);
      if (id) return id;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const asyncTask = obj.async_task as { id?: string } | undefined;
  if (asyncTask?.id && typeof asyncTask.id === "string") return asyncTask.id;
  if (typeof obj.task_id === "string" && obj.task_id.length >= 8) {
    return obj.task_id;
  }
  for (const v of Object.values(obj)) {
    const id = pickTaskId(v, depth + 1);
    if (id) return id;
  }
  return null;
}

function extractAsyncTaskId(raw: string): string | null {
  for (const ev of parseSseRaw(raw)) {
    // 先走严格路径（会抛风控），再走宽松 event_data
    let inner: Record<string, unknown> | null = null;
    try {
      const et = asNum(ev.event_type);
      if (et === 2005 || et === 2006) {
        eventInner(ev); // throw
      }
      if (et === 2001) inner = eventInner(ev);
    } catch (e) {
      if (e instanceof Error && /频繁|限流|710022|接口错误|接口失败/.test(e.message)) {
        throw e;
      }
    }
    if (!inner) inner = looseEventData(ev);
    if (!inner) continue;

    let fin = inner.fin_reason as
      | string
      | { reason?: number; async_task?: { id?: string } }
      | undefined;
    if (typeof fin === "string") {
      try {
        fin = JSON.parse(fin) as {
          reason?: number;
          async_task?: { id?: string };
        };
      } catch {
        fin = undefined;
      }
    }
    if (fin && typeof fin === "object" && fin.async_task?.id) {
      return fin.async_task.id;
    }

    const nested = pickTaskId(inner);
    if (nested) return nested;

    const msg = inner.message as Record<string, unknown> | undefined;
    if (msg) {
      const fromMsg = pickTaskId(msg);
      if (fromMsg) return fromMsg;
      // ext 里偶发挂 task
      const fromExt = pickTaskId(msg.ext);
      if (fromExt) return fromExt;
    }
  }

  // 整包转义串兜底（event_data 双重转义时）
  const unescaped = raw
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  const patterns = [
    /"async_task"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/,
    /"async_task"\s*:\s*\{[^}]*?"id"\s*:\s*"([^"]+)"/,
    /fin_reason[\s\S]{0,400}?"id"\s*:\s*"([a-fA-F0-9-]{8,})"/,
    /"task_id"\s*:\s*"([a-fA-F0-9-]{8,})"/,
  ];
  for (const src of [raw, unescaped]) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m?.[1]) return m[1];
    }
  }
  return null;
}

function decodeVideoModel(vmRaw: unknown): string {
  if (!vmRaw) return "";
  try {
    const vm =
      typeof vmRaw === "string"
        ? (JSON.parse(vmRaw) as Record<string, unknown>)
        : (vmRaw as Record<string, unknown>);
    const vlist = (vm.video_list || vm.videos || {}) as Record<
      string,
      { main_url?: string; url?: string; video_url?: string }
    >;
    for (const v of Object.values(vlist)) {
      if (!v || typeof v !== "object") continue;
      const b64 = v.main_url || "";
      if (b64) {
        try {
          const decoded = Buffer.from(b64, "base64").toString("utf8");
          if (/^https?:\/\//i.test(decoded)) return decoded;
        } catch {
          /* fallthrough */
        }
        if (/^https?:\/\//i.test(b64)) return b64;
      }
      const direct = v.video_url || v.url || "";
      if (/^https?:\/\//i.test(direct)) return direct;
    }
    const top =
      (vm.video_url as string) ||
      (vm.url as string) ||
      (vm.main_url as string) ||
      "";
    if (/^https?:\/\//i.test(top)) return top;
    if (top) {
      try {
        const decoded = Buffer.from(top, "base64").toString("utf8");
        if (/^https?:\/\//i.test(decoded)) return decoded;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return "";
}

function looksLikeVideoUrl(u: string) {
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(u)) return false;
  if (/thumb|cover|poster|preview|cthumb|byteimg|imagex|tplv-/i.test(u)) {
    if (!/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u)) return false;
  }
  if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u)) return true;
  // 勿泛匹配 doubao —— 会把图链当成视频导致黑屏
  if (
    /bytev|vlabvod|mediasource|\/video\/|video_id=|play_url|vod\./i.test(u)
  ) {
    return true;
  }
  return false;
}

function scoreVideoUrl(u: string): number {
  let s = 0;
  if (/\.mp4(\?|$)/i.test(u)) s += 50;
  if (/\.(webm|mov)(\?|$)/i.test(u)) s += 40;
  if (/bytev|vlabvod|mediasource/i.test(u)) s += 30;
  if (/play_url|download/i.test(u)) s += 20;
  if (/cover|thumb|poster|preview/i.test(u)) s -= 40;
  s += Math.min(20, Math.floor(u.length / 80));
  return s;
}

function collectVideoUrlsDeep(node: unknown, out: string[], depth = 0) {
  if (depth > 14 || node == null) return;
  if (typeof node === "string") {
    if (looksLikeVideoUrl(node) && !out.includes(node)) out.push(node);
    for (const m of node.matchAll(
      /https?:\/\/[^\s"'\\<>]+?(?:\.(?:mp4|webm|mov|m3u8)|bytev|vlabvod|mediasource|\/video\/)[^\s"'\\<>]*/gi,
    )) {
      const u = m[0].replace(/[),.;]+$/, "");
      if (looksLikeVideoUrl(u) && !out.includes(u)) out.push(u);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectVideoUrlsDeep(x, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("video_model" in obj) {
      const u = decodeVideoModel(obj.video_model);
      if (u && looksLikeVideoUrl(u) && !out.includes(u)) out.push(u);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (/cover|thumb|poster|image/i.test(k)) continue;
      if (
        typeof v === "string" &&
        /video_url|play_url|main_url|download_url|video/i.test(k) &&
        looksLikeVideoUrl(v) &&
        !out.includes(v)
      ) {
        out.push(v);
      } else if (typeof v === "string" && k === "url" && looksLikeVideoUrl(v)) {
        out.push(v);
      } else {
        collectVideoUrlsDeep(v, out, depth + 1);
      }
    }
  }
}

function parseVideoUrls(raw: string): string[] {
  const urls: string[] = [];
  for (const ev of parseSseRaw(raw)) {
    let inner: Record<string, unknown> | null = null;
    try {
      inner = eventInner(ev);
    } catch {
      continue;
    }
    if (!inner) inner = looseEventData(ev);
    if (!inner) continue;
    const msg = inner.message as
      | { content?: string; content_type?: number | string }
      | undefined;
    if (!msg?.content) {
      collectVideoUrlsDeep(inner, urls);
      continue;
    }
    const ct = asNum(msg.content_type);
    if (ct != null && ct !== 2021 && ct !== 2001 && ct !== 2074) {
      collectVideoUrlsDeep(inner, urls);
      continue;
    }
    try {
      const content =
        typeof msg.content === "string"
          ? (JSON.parse(msg.content) as Record<string, unknown>)
          : (msg.content as unknown as Record<string, unknown>);
      const items = Array.isArray(content.data)
        ? (content.data as Record<string, unknown>[])
        : [content];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        let videoUrl =
          (item.video_url as string) ||
          (item.play_url as string) ||
          (item.download_url as string) ||
          "";
        if (!videoUrl) videoUrl = decodeVideoModel(item.video_model);
        if (
          !videoUrl &&
          typeof item.url === "string" &&
          looksLikeVideoUrl(item.url)
        ) {
          videoUrl = item.url;
        }
        if (videoUrl && looksLikeVideoUrl(videoUrl) && !urls.includes(videoUrl)) {
          urls.push(videoUrl);
        }
      }
      if (ct === 2021 || !urls.length) collectVideoUrlsDeep(content, urls);
    } catch {
      collectVideoUrlsDeep(msg.content, urls);
    }
  }
  if (!urls.length) collectVideoUrlsDeep(raw, urls);
  return [...urls].sort((a, b) => scoreVideoUrl(b) - scoreVideoUrl(a));
}

function isMp4Buffer(buf: Buffer) {
  return buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp";
}

async function materializeVideoUrl(
  sessionId: string,
  remoteUrl: string,
): Promise<string | null> {
  const cleaned = remoteUrl
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .trim();
  if (!looksLikeVideoUrl(cleaned)) return null;

  try {
    const res = await fetch(cleaned, {
      headers: {
        ...FAKE_HEADERS,
        Accept: "video/mp4,video/*,*/*;q=0.8",
        Referer: `${BASE}/chat/`,
        Cookie: cookieFor(sessionId),
      },
      signal: AbortSignal.timeout(180_000),
      redirect: "follow",
    });
    if (!res.ok && res.status !== 206) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("json") || ct.includes("text/html") || ct.includes("image/")) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) return null;
    const looksMp4 = isMp4Buffer(buf) || /video\/mp4|octet-stream/i.test(ct);
    if (!looksMp4 && !/video\//i.test(ct) && !/\.mp4(\?|$)/i.test(cleaned)) {
      return null;
    }
    const mime = /webm/i.test(ct) && !looksMp4 ? "video/webm" : "video/mp4";
    const ext = mime === "video/webm" ? "webm" : "mp4";
    return putTmpMedia(buf, mime, ext);
  } catch {
    return null;
  }
}

async function pollAsyncSkill(
  sessionId: string,
  taskId: string,
  timeoutMs: number,
  opts?: { dropFp?: boolean },
): Promise<string> {
  await throttle(sessionId);
  const profile = stableProfile(sessionId);
  const qs = queryParams(SKILL_AID, profile);
  // doubao2api：async/stream 不带 fp
  if (opts?.dropFp) qs.delete("fp");
  const res = await fetch(`${BASE}/samantha/chat/async/stream?${qs}`, {
    method: "POST",
    headers: commonHeaders(sessionId),
    body: JSON.stringify({ task_id: taskId, event_id: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`豆包异步轮询失败: ${res.status} ${raw.slice(0, 240)}`);
  }
  return raw;
}

async function pollAsyncVideo(
  sessionId: string,
  taskId: string,
  timeoutMs: number,
): Promise<string> {
  const raw = await pollAsyncSkill(sessionId, taskId, timeoutMs, {
    dropFp: true,
  });
  const urls = parseVideoUrls(raw);
  if (!urls.length) {
    const debug = inspectImageResponse(raw);
    const hint =
      debug.fatalHint ||
      debug.textHint ||
      (raw.trim() ? `片段: ${raw.replace(/\s+/g, " ").slice(0, 140)}` : "空响应");
    throw new Error(`豆包网页视频未返回地址（${hint}）`);
  }
  for (const u of urls.slice(0, 4)) {
    const local = await materializeVideoUrl(sessionId, u);
    if (local) return local;
  }
  throw new Error(
    `豆包视频地址无法拉取播放（候选 ${urls.length} 条，可能防盗链）。请重试`,
  );
}

/** 网页视频提示词：压短分镜正文，保留并重写默认约束块 */
export function compactDoubaoVideoPrompt(
  prompt: string,
  maxChars = 900,
  aspectRatio?: string,
  duration?: number,
): string {
  let s = (prompt || "").trim();
  // 清掉误传入的即梦 omni 槽位语法，否则豆包会当普通聊天回复
  s = s
    .replace(/@image_file_\d+\s*/gi, "")
    .replace(/锁定角色「[^」]*」形象与服装[^。\n]*[。.]?/g, "")
    .replace(/作为本镜(?:场景环境|首帧构图|末帧定格)参考[^。\n]*[。.]?/g, "")
    .replace(/分镜内容[：:]\s*/g, "")
    .replace(/\n?Default:\s*[^\n]*/gi, "")
    .replace(/\s*--duration\s+\d+/gi, "")
    .replace(/\s*--ratio\s+[\d:]+/gi, "")
    .replace(/【画面默认】[^\n]*/g, "")
    .replace(/【场景默认】[^\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 先剥掉旧约束，只压缩分镜正文
  s = s
    .replace(/^生成视频\s*[：:]/, "")
    .replace(/\n?【视频默认约束】[\s\S]*$/m, "")
    .trim();

  s = `${s}\nCG国漫电影级渲染，统一光影。`.trim();

  // 正文上限：给默认约束块留空间
  const storyBudget = Math.max(280, maxChars - 420);
  if (s.length > storyBudget) {
    const cut = s.slice(0, storyBudget);
    const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf("。"));
    s = (lastBreak > storyBudget * 0.5 ? cut.slice(0, lastBreak + 1) : cut).trim();
  }

  return withGenerateVideoPrefix(s, aspectRatio, duration);
}

const CAMERA_ENUM = new Set([
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
  "tilt_up",
  "tilt_down",
  "orbit_left",
  "orbit_right",
  "static",
  "ZoomIn",
  "ZoomOut",
  "PanLeft",
  "PanRight",
  "TiltUp",
  "TiltDown",
  "Static",
]);

function normalizeVideoRatio(ratio?: string): string | undefined {
  const r = (ratio || "").trim();
  if (!r) return undefined;
  if (/^(1:1|16:9|9:16|4:3|3:4)$/.test(r)) return r;
  if (r === "9/16" || r === "0.5625") return "9:16";
  if (r === "16/9" || r === "1.777") return "16:9";
  return "9:16";
}

function mapWebSeedanceModel(variant?: string): string {
  if (variant === "fast") return "seedance-2.0-fast";
  if (variant === "mini") return "seedance-2.0-mini";
  return "seedance-2.0";
}

/**
 * 官网视频靠 chat_ability.ability_type=17 激活（dorakoo 拦截确认）。
 * duration/model 放 ability_param；content 只放 text(+ratio)。
 */
function buildVideoChatAbility(input: {
  duration: number;
  ratio?: string;
  model: string;
}) {
  const duration = Math.min(Math.max(Math.round(input.duration || 15), 4), 15);
  const param: Record<string, unknown> = {
    duration,
    model: input.model,
    resolution: "720p",
  };
  if (input.ratio) {
    param.ratio = input.ratio;
    param.aspect_ratio = input.ratio;
  }
  return {
    ability_type: 17,
    ability_param: JSON.stringify(param),
  };
}

async function warmDoubaoCsrf(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/chat/`, {
      method: "GET",
      headers: {
        ...FAKE_HEADERS,
        Accept: "text/html,application/xhtml+xml",
        Cookie: cookieFor(sessionId),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) mergeSetCookiesIntoJar(sessionId, setCookie);
    for (const c of setCookie) {
      const m = c.match(/passport_csrf_token(?:_default)?=([^;]+)/i);
      if (m?.[1]) return decodeURIComponent(m[1]);
    }
    // 部分环境只在 Cookie 响应里拆开
    const raw = res.headers.get("set-cookie") || "";
    if (raw) mergeSetCookiesIntoJar(sessionId, [raw]);
    const m2 = raw.match(/passport_csrf_token(?:_default)?=([^;]+)/i);
    return m2?.[1] ? decodeURIComponent(m2[1]) : null;
  } catch {
    return null;
  }
}

const EXTENSION_BOT_ID = "7338286299411103781";

function csrfFromJar(sessionId: string): string | null {
  const jar = cookieFor(sessionId);
  const m = jar.match(/(?:^|;\s*)passport_csrf_token(?:_default)?=([^;]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

type UploadedWebImage = {
  uri: string;
  cdnUrl: string;
  name: string;
  format: string;
  width: number;
  height: number;
  role?: string;
  label?: string;
};

function buildImageContentBlock(img: UploadedWebImage) {
  return {
    block_type: 10052,
    content: {
      attachment_block: {
        attachments: [
          {
            type: 1,
            identifier: randomUUID(),
            image: {
              name: img.name,
              uri: img.uri,
              image_ori: {
                url: img.cdnUrl,
                width: img.width,
                height: img.height,
                format: img.format,
                url_formats: {},
              },
            },
            parse_state: 0,
            review_state: 0,
          },
        ],
      },
      pc_event_block: "",
    },
    block_id: randomUUID(),
    parent_id: "",
    meta_info: [],
    append_fields: [],
    is_finish: true,
    patch_type: 2,
  };
}

/**
 * 官网同源：POST /chat/completion + chat_ability.ability_type=17
 * （dorakoo 拦截确认网页视频走此入口，而非旧版 samantha skill）
 */
async function submitVideoOfficialChat(
  sessionId: string,
  opts: {
    text: string;
    ratio?: string;
    duration: number;
    model: string;
    refImages?: UploadedWebImage[];
    /** @deprecated 单图兼容 */
    refImage?: UploadedWebImage;
    csrf?: string | null;
    timeoutMs: number;
    label?: string;
    /** 复用已有对话；空则新建一次并回传 */
    conversationId?: string;
  },
): Promise<string> {
  const refs =
    opts.refImages?.length
      ? opts.refImages
      : opts.refImage
        ? [opts.refImage]
        : [];
  const contentBlocks: Record<string, unknown>[] = refs.map(buildImageContentBlock);
  contentBlocks.push({
    block_type: 10000,
    content: {
      text_block: {
        text: opts.text,
        icon_url: "",
        icon_url_dark: "",
        summary: "",
      },
      pc_event_block: "",
    },
    block_id: randomUUID(),
    parent_id: "",
    meta_info: [],
    append_fields: [],
    is_finish: true,
    patch_type: 2,
  });

  const existing = (opts.conversationId || "").trim();
  const needCreate = !existing || existing === "0";

  const body = {
    client_meta: {
      local_conversation_id: needCreate
        ? `local_${randomUUID().replace(/-/g, "").slice(0, 16)}`
        : `local_${existing.slice(0, 16)}`,
      conversation_id: needCreate ? "" : existing,
      bot_id: EXTENSION_BOT_ID,
      last_section_id: "",
      last_message_index: 0,
    },
    messages: [
      {
        local_message_id: randomUUID(),
        content_block: contentBlocks,
        message_status: 0,
      },
    ],
    option: {
      send_message_scene: "",
      create_time_ms: 0,
      collect_id: "",
      is_audio: false,
      answer_with_suggest: true,
      tts_switch: false,
      need_deep_think: 0,
      click_clear_context: false,
      from_suggest: false,
      is_regen: false,
      is_replace: false,
      disable_sse_cache: false,
      select_text_action: "",
      resend_for_regen: false,
      scene_type: 0,
      unique_key: randomUUID(),
      start_seq: 0,
      need_create_conversation: needCreate,
      conversation_init_option: { need_ack_conversation: true },
      regen_query_id: [] as string[],
      edit_query_id: [] as string[],
      regen_instruction: "",
      no_replace_for_regen: false,
      message_from: 0,
      shared_app_name: "",
      action_bar_skill_id: 17,
      sse_recv_event_options: { support_chunk_delta: true },
      is_ai_playground: false,
    },
    chat_ability: buildVideoChatAbility({
      duration: opts.duration,
      ratio: opts.ratio,
      model: opts.model,
    }),
    ext: {
      use_deep_think: "false",
      fp: stableProfile(sessionId).fp,
      use_submit_pipeline: "1",
      commerce_credit_config_enable: "0",
      sub_conv_firstmet_type: "1",
    },
  };

  await throttle(sessionId);
  const profile = stableProfile(sessionId);
  const qs = queryParams(SKILL_AID, profile);
  const csrf = opts.csrf || csrfFromJar(sessionId);
  const headers: Record<string, string> = {
    ...FAKE_HEADERS,
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    Cookie: cookieFor(sessionId),
    "X-Flow-Trace": `04-${randomUUID()}-${randomUUID().slice(0, 16)}-01`,
  };
  if (csrf) headers["x-tt-passport-csrf-token"] = csrf;

  const res = await fetch(`${BASE}/chat/completion?${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  const text = await res.text();
  const debug = inspectImageResponse(text);
  console.info("[doubao-web-video]", {
    label: opts.label || "official-chat",
    endpoint: "/chat/completion",
    refCount: refs.length,
    status: res.status,
    len: text.length,
    hasAsync: debug.hasAsyncTask,
    contentTypes: debug.contentTypes,
    textHint: debug.textHint?.slice(0, 80),
    snippet: text.replace(/\s+/g, " ").slice(0, 180),
  });
  if (!res.ok) {
    throw new Error(`豆包官网视频请求失败: ${res.status} ${text.slice(0, 240)}`);
  }
  return text;
}

async function submitVideoCompletion(
  sessionId: string,
  opts: {
    text: string;
    ratio?: string;
    duration: number;
    model: string;
    refKeys?: string[];
    refKey?: string;
    aid?: string;
    csrf?: string | null;
    timeoutMs: number;
    /** false = 纯 skill（doubao2api 路线）；true = 官网 chat_ability */
    useChatAbility?: boolean;
    label?: string;
    conversationId?: string;
  },
): Promise<string> {
  // 对齐官网 / doubao2api：content 仅 text + 可选 ratio，勿塞 model/duration
  const content: Record<string, unknown> = { text: opts.text };
  if (opts.ratio) content.ratio = opts.ratio;

  const keys =
    opts.refKeys?.filter(Boolean) ||
    (opts.refKey ? [opts.refKey] : []);

  const existing = (opts.conversationId || "").trim();
  const needCreate = !existing || existing === "0";

  const message: Record<string, unknown> = {
    content: JSON.stringify(content),
    content_type: 2020,
    attachments: keys.map((key) => ({ type: "image", key })),
    references: [],
    skill: {
      skill_type: 17,
      skill_type_no_default: 17,
      skill_id: "17",
      skill_id_no_default: "17",
    },
  };

  const body: Record<string, unknown> = {
    messages: [message],
    completion_option: {
      ...skillCompletionOption(17),
      need_create_conversation: needCreate,
    },
    evaluate_option: { web_ab_params: "" },
    conversation_id: needCreate ? "0" : existing,
    local_conversation_id: needCreate
      ? randomUUID()
      : `local_${existing.slice(0, 16)}`,
    local_message_id: randomUUID(),
  };
  if (opts.useChatAbility !== false) {
    body.chat_ability = buildVideoChatAbility({
      duration: opts.duration,
      ratio: opts.ratio,
      model: opts.model,
    });
  }

  await throttle(sessionId);
  const profile = stableProfile(sessionId);
  const aid = opts.aid || SKILL_AID;
  const qs = queryParams(aid, profile);
  const headers = commonHeaders(
    sessionId,
    opts.csrf
      ? { "x-tt-passport-csrf-token": opts.csrf }
      : undefined,
  );
  const res = await fetch(`${BASE}/samantha/chat/completion?${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  const text = await res.text();
  const debug = inspectImageResponse(text);
  console.info("[doubao-web-video]", {
    label: opts.label || "submit",
    aid,
    useChatAbility: opts.useChatAbility !== false,
    status: res.status,
    len: text.length,
    hasAsync: debug.hasAsyncTask,
    contentTypes: debug.contentTypes,
    textHint: debug.textHint?.slice(0, 80),
  });
  if (!res.ok) {
    throw new Error(`豆包网页请求失败: ${res.status} ${text.slice(0, 240)}`);
  }
  return text;
}

function isVideoChatFallback(raw: string): boolean {
  const debug = inspectImageResponse(raw);
  if (debug.hasAsyncTask) return false;
  if (parseVideoUrls(raw).length) return false;
  const cts = debug.contentTypes;
  if (!cts.length) return true;
  return cts.every(
    (c) => c === 2001 || c === 2002 || c === 2008 || c === 10000 || c === 10040,
  );
}

/** 豆包要用户确认后再开拍（如「确认后我再开始生成视频。」） */
export function isVideoConfirmPrompt(text?: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  return (
    /确认后.*(?:开始)?生成视频/.test(t) ||
    /确认后我再开始/.test(t) ||
    /请(?:先)?确认(?:后|再|一下)?/.test(t) ||
    /是否(?:现在|立即)?开始生成/.test(t) ||
    /回复?[「"']?确定[」"']?/.test(t) ||
    (/确认/.test(t) && /生成视频/.test(t) && /(?:开始|再|后)/.test(t))
  );
}

function diagnoseVideoSubmit(raw: string): string {
  const debug = inspectImageResponse(raw);
  if (debug.fatalHint) return debug.fatalHint;

  const events = parseSseRaw(raw);
  const contentTypes = debug.contentTypes;
  const onlyChat = isVideoChatFallback(raw);
  const onlyEcho =
    events.length > 0 &&
    contentTypes.length > 0 &&
    contentTypes.every((c) => c === 2020) &&
    !debug.hasAsyncTask;

  if (debug.textHint) {
    const t = debug.textHint;
    if (/服务过载|重试|额度|上限|繁忙|排队|敏感|违规|无法生成|登录|权限|未开通/.test(t)) {
      return t.slice(0, 160);
    }
    if (onlyChat) {
      return `网页视频参数未生效（聊天：${t.slice(0, 60)}）。可重贴整段 Cookie，或填方舟 Key`;
    }
  }

  if (onlyChat) {
    return "网页视频未激活（无 async_task）。请粘贴官网整段 Cookie，或填写方舟 API Key";
  }

  if (onlyEcho || (/conversation_id":"0"/.test(raw) && !debug.hasAsyncTask)) {
    return "视频技能仅回声无任务。请重试或配置方舟 API Key";
  }

  if (!raw.trim()) return "空响应，请重新登录豆包";
  if (!events.length) {
    return `SSE 无法解析（len=${raw.length}）: ${raw.replace(/\s+/g, " ").slice(0, 120)}`;
  }
  return `事件${events.length}个 content_type=[${contentTypes.join(",") || "?"}] ${raw.replace(/\s+/g, " ").slice(0, 100)}`;
}

/**
 * 文生视频 / 图文生视频：
 * 1) 官网 /chat/completion + chat_ability=17（与网页拦截一致）
 * 2) 回退 samantha skill 17/2020
 * 会上传角色 / 场景 / 首帧等多图附件；提示词带「生成视频：」前缀
 */
export async function doubaoWebGenerateVideo(input: {
  sessionId: string;
  /** 官网整段 Cookie，视频比生图更需要 */
  cookieHeader?: string;
  prompt: string;
  ratio?: string;
  duration?: number;
  variant?: "mini" | "fast";
  cameraMovement?: string;
  /** 复用同一豆包对话；首次可空，返回后应保存 */
  conversationId?: string;
  /** @deprecated 单图；优先 refImageUrls / refAssets */
  refImageUrl?: string;
  refImageUrls?: string[];
  refAssets?: Array<{
    url: string;
    role: string;
    label: string;
  }>;
  timeoutMs?: number;
}): Promise<{
  videoUrl?: string;
  model: string;
  chatText?: string;
  conversationId?: string;
}> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) throw new Error("缺少豆包网页 sessionid");
  seedDoubaoWebCookies(sessionId, input.cookieHeader);
  const timeoutMs = input.timeoutMs ?? 300_000;
  const ratio = normalizeVideoRatio(input.ratio);
  const duration = Math.min(Math.max(Math.round(input.duration || 15), 4), 15);
  const webModel = mapWebSeedanceModel(input.variant);
  const prompt = compactDoubaoVideoPrompt(
    input.prompt,
    900,
    ratio,
    duration,
  );
  const csrf = (await warmDoubaoCsrf(sessionId)) || csrfFromJar(sessionId);
  const reuseConversationId = (input.conversationId || "").trim() || undefined;

  const assetSpecs =
    input.refAssets?.filter((a) => a.url?.trim()) ||
    (input.refImageUrls || [])
      .filter(Boolean)
      .map((url, i) => ({ url, role: "ref", label: `图${i + 1}` })) ||
    (input.refImageUrl
      ? [{ url: input.refImageUrl, role: "first_frame", label: "首帧" }]
      : []);

  const uploaded: UploadedWebImage[] = [];
  for (const spec of assetSpecs.slice(0, 6)) {
    const fetched = await fetchImageBytes(spec.url);
    if (!fetched) continue;
    try {
      const up = await doubaoWebUploadImage(
        sessionId,
        fetched.bytes,
        fetched.filename.replace(
          /^ref\./,
          `${spec.role || "ref"}_${spec.label || "img"}.`,
        ),
      );
      uploaded.push({
        ...up,
        role: spec.role,
        label: spec.label,
      });
    } catch (e) {
      console.warn(
        "[doubao-web-video] upload asset failed",
        spec.label,
        e instanceof Error ? e.message : e,
      );
    }
  }
  console.info("[doubao-web-video] uploaded assets", {
    requested: assetSpecs.length,
    uploaded: uploaded.length,
    labels: uploaded.map((u) => u.label || u.role),
  });

  const shortText =
    compactDoubaoVideoPrompt(input.prompt, 280, ratio, duration)
      .replace(/\nCG国漫电影级渲染[^\n]*/g, "")
      .trim() || "生成视频：让画面中的人物自然活动，镜头缓慢推进";

  async function finishFromRaw(
    raw: string,
    modelTag: string,
  ): Promise<{
    videoUrl?: string;
    model: string;
    chatText?: string;
    conversationId?: string;
  } | null> {
    const chat = extractSseAssistantChat(raw);
    const debug = inspectImageResponse(raw);
    const chatText = chat.text || debug.textHint || "";
    const conversationId =
      chat.conversationId ||
      raw.match(/"conversation_id"\s*:\s*"(\d{5,})"/)?.[1] ||
      reuseConversationId ||
      undefined;

    const taskId = extractAsyncTaskId(raw);
    if (taskId) {
      const videoUrl = await pollAsyncVideo(sessionId, taskId, timeoutMs);
      return {
        videoUrl,
        model: modelTag,
        chatText: chatText || undefined,
        conversationId,
      };
    }
    const syncUrls = parseVideoUrls(raw);
    for (const u of syncUrls.slice(0, 4)) {
      const local = await materializeVideoUrl(sessionId, u);
      if (local) {
        return {
          videoUrl: local,
          model: modelTag,
          chatText: chatText || undefined,
          conversationId,
        };
      }
    }
    if (syncUrls.length) {
      throw new Error(
        `豆包视频地址无法拉取播放（候选 ${syncUrls.length} 条）。请重试`,
      );
    }
    // 无视频：只要有对话就带回面板（不再要求 isVideoChatFallback）
    if (chatText) {
      return {
        model: modelTag,
        chatText,
        conversationId,
      };
    }
    if (debug.fatalHint) {
      throw new Error(`豆包网页视频: ${debug.fatalHint}`);
    }
    return null;
  }

  // 少次尝试：多图上传后官网一轮 + samantha 一轮，尽快把对话吐回面板
  const attempts: Array<{
    label: string;
    text: string;
    via: "official" | "samantha";
    withRefs: boolean;
  }> = [
    { label: "official+multi", text: prompt, via: "official", withRefs: true },
    {
      label: "samantha+ability",
      text: shortText,
      via: "samantha",
      withRefs: true,
    },
  ];

  let lastRaw = "";
  let lastChat: {
    chatText?: string;
    conversationId?: string;
    model: string;
  } | null = null;
  /** 同一账号全程复用；新建后立刻钉死，后续尝试不再开新窗 */
  let threadId = reuseConversationId;

  async function tryConfirmAndFetchVideo(
    chatText: string,
    conversationId: string | undefined,
    modelTag: string,
  ): Promise<{
    videoUrl?: string;
    model: string;
    chatText?: string;
    conversationId?: string;
  } | null> {
    if (!isVideoConfirmPrompt(chatText)) return null;
    const conv = (conversationId || threadId || "").trim();
    if (!conv || conv === "0") return null;
    threadId = conv;
    console.info("[doubao-web-video] auto-confirm 确定", {
      conversationId: conv,
      hint: chatText.slice(0, 60),
    });
    await new Promise((r) => setTimeout(r, 500));
    // 仍走视频能力通道，避免普通聊天丢 skill
    let confirmRaw = "";
    try {
      confirmRaw = await submitVideoOfficialChat(sessionId, {
        text: "确定",
        ratio,
        duration,
        model: webModel,
        csrf,
        timeoutMs: Math.min(timeoutMs, 240_000),
        label: "auto-confirm-official",
        conversationId: conv,
      });
    } catch (e) {
      console.warn(
        "[doubao-web-video] official confirm failed",
        e instanceof Error ? e.message : e,
      );
    }
    if (!confirmRaw) {
      try {
        confirmRaw = await submitVideoCompletion(sessionId, {
          text: "确定",
          ratio,
          duration,
          model: webModel,
          csrf,
          timeoutMs: Math.min(timeoutMs, 240_000),
          useChatAbility: true,
          label: "auto-confirm-samantha",
          conversationId: conv,
        });
      } catch (e) {
        console.warn(
          "[doubao-web-video] samantha confirm failed",
          e instanceof Error ? e.message : e,
        );
        return null;
      }
    }
    lastRaw = confirmRaw;
    const confirmed = await finishFromRaw(confirmRaw, modelTag);
    if (confirmed?.conversationId) threadId = confirmed.conversationId;
    return confirmed;
  }

  for (const attempt of attempts) {
    if (attempt.withRefs && !uploaded.length && attempt.via === "official") {
      continue;
    }
    const raw =
      attempt.via === "official"
        ? await submitVideoOfficialChat(sessionId, {
            text: attempt.text,
            ratio,
            duration,
            model: webModel,
            refImages: attempt.withRefs ? uploaded : undefined,
            csrf,
            timeoutMs: 90_000,
            label: attempt.label,
            conversationId: threadId,
          })
        : await submitVideoCompletion(sessionId, {
            text: attempt.text,
            ratio,
            duration,
            model: webModel,
            refKeys: attempt.withRefs
              ? uploaded.map((u) => u.uri)
              : undefined,
            csrf,
            timeoutMs: 90_000,
            useChatAbility: true,
            label: attempt.label,
            conversationId: threadId,
          });
    lastRaw = raw;
    const done = await finishFromRaw(raw, `doubao-web-${webModel}`);
    if (done?.conversationId) threadId = done.conversationId;
    if (done?.videoUrl) return { ...done, conversationId: threadId };
    if (done?.chatText) {
      const confirmed = await tryConfirmAndFetchVideo(
        done.chatText,
        done.conversationId || threadId,
        done.model,
      );
      if (confirmed?.videoUrl) {
        return { ...confirmed, conversationId: threadId };
      }
      if (confirmed?.chatText) {
        lastChat = {
          chatText: confirmed.chatText,
          conversationId: confirmed.conversationId || threadId,
          model: confirmed.model,
        };
        // 已自动确认过仍无视频：不再二次确认，交给上层
        break;
      }
      lastChat = {
        chatText: done.chatText,
        conversationId: done.conversationId || threadId,
        model: done.model,
      };
      // 确认类回复已处理；其它聊天回退可再试下一通道
      if (isVideoConfirmPrompt(done.chatText)) break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (lastChat?.chatText) {
    return {
      ...lastChat,
      conversationId: lastChat.conversationId || threadId,
    };
  }
  const fallbackChat = extractSseAssistantChat(lastRaw);
  const hint = inspectImageResponse(lastRaw).textHint;
  const text = fallbackChat.text || hint;
  if (text) {
    const conv =
      fallbackChat.conversationId || threadId || reuseConversationId || undefined;
    const confirmed = await tryConfirmAndFetchVideo(
      text,
      conv,
      `doubao-web-${webModel}`,
    );
    if (confirmed?.videoUrl) {
      return { ...confirmed, conversationId: threadId || conv };
    }
    return {
      model: `doubao-web-${webModel}`,
      chatText: confirmed?.chatText || text,
      conversationId: threadId || conv,
    };
  }

  throw new Error(
    `豆包网页视频未返回任务或结果（${diagnoseVideoSubmit(lastRaw)}）`,
  );
}

/**
 * 在已有豆包视频对话窗中继续发言（如手动「确定」或改词），
 * 并从聊天 SSE / 异步任务里直接捞视频地址。
 */
export async function doubaoWebContinueForVideo(input: {
  sessionId: string;
  cookieHeader?: string;
  message: string;
  conversationId: string;
  ratio?: string;
  duration?: number;
  variant?: "mini" | "fast";
  timeoutMs?: number;
}): Promise<{
  videoUrl?: string;
  chatText?: string;
  conversationId: string;
  model: string;
}> {
  const sessionId = input.sessionId.trim();
  const message = input.message.trim();
  let conversationId = input.conversationId.trim();
  if (!sessionId) throw new Error("缺少豆包网页 sessionid");
  if (!message) throw new Error("请输入回复内容");
  if (!conversationId || conversationId === "0") {
    throw new Error("缺少豆包对话 id，无法在同一聊天窗继续");
  }
  seedDoubaoWebCookies(sessionId, input.cookieHeader);
  const timeoutMs = input.timeoutMs ?? 300_000;
  const ratio = normalizeVideoRatio(input.ratio);
  const duration = Math.min(Math.max(Math.round(input.duration || 15), 4), 15);
  const webModel = mapWebSeedanceModel(input.variant);
  const csrf = (await warmDoubaoCsrf(sessionId)) || csrfFromJar(sessionId);
  const modelTag = `doubao-web-${webModel}`;

  async function finishContinue(raw: string) {
    const chat = extractSseAssistantChat(raw);
    const debug = inspectImageResponse(raw);
    const chatText = chat.text || debug.textHint || "";
    if (chat.conversationId) conversationId = chat.conversationId;

    const taskId = extractAsyncTaskId(raw);
    if (taskId) {
      const videoUrl = await pollAsyncVideo(sessionId, taskId, timeoutMs);
      return {
        videoUrl,
        model: modelTag,
        chatText: chatText || undefined,
        conversationId,
      };
    }
    const syncUrls = parseVideoUrls(raw);
    for (const u of syncUrls.slice(0, 4)) {
      const local = await materializeVideoUrl(sessionId, u);
      if (local) {
        return {
          videoUrl: local,
          model: modelTag,
          chatText: chatText || undefined,
          conversationId,
        };
      }
    }
    return {
      model: modelTag,
      chatText: chatText || undefined,
      conversationId,
    };
  }

  async function sendOnce(text: string, label: string) {
    try {
      const raw = await submitVideoOfficialChat(sessionId, {
        text,
        ratio,
        duration,
        model: webModel,
        csrf,
        timeoutMs: Math.min(timeoutMs, 240_000),
        label,
        conversationId,
      });
      return finishContinue(raw);
    } catch {
      const raw = await submitVideoCompletion(sessionId, {
        text,
        ratio,
        duration,
        model: webModel,
        csrf,
        timeoutMs: Math.min(timeoutMs, 240_000),
        useChatAbility: true,
        label: `${label}-samantha`,
        conversationId,
      });
      return finishContinue(raw);
    }
  }

  let result = await sendOnce(message, "continue-video");
  if (result.videoUrl) return result;

  if (result.chatText && isVideoConfirmPrompt(result.chatText)) {
    console.info("[doubao-web-video] continue auto-confirm 确定", {
      conversationId,
    });
    await new Promise((r) => setTimeout(r, 500));
    result = await sendOnce("确定", "continue-confirm");
  }

  return result;
}

/** 常见大模型 JSON 瑕疵修复 */
function repairJsonText(input: string): string {
  let s = input.trim();
  // 去掉 BOM / 零宽字符
  s = s.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  // 智能引号 → 标准引号
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // 尾逗号：, ] 或 , }
  s = s.replace(/,\s*([}\]])/g, "$1");
  // 数组/对象元素之间缺逗号：}{  ][  }"  ]"
  s = s.replace(/}\s*{/g, "},{");
  s = s.replace(/]\s*\[/g, "],[");
  s = s.replace(/}\s*"/g, '},"');
  s = s.replace(/]\s*"/g, '],"');
  // 数字/true/false/null 后直接跟 "key"
  s = s.replace(/(true|false|null|\d+(?:\.\d+)?)\s*"/gi, '$1,"');
  return s;
}

/**
 * 尝试把字符串值里未转义的英文双引号改成中文引号「」，
 * 避免 dialogue/storyboardPrompt 里出现 "他说"你好"" 这类破 JSON。
 */
function softenInnerQuotes(jsonLike: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonLike.length; i++) {
    const ch = jsonLike[i];
    if (!inString) {
      if (ch === '"') {
        inString = true;
        out += ch;
      } else {
        out += ch;
      }
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      // 窥探后面：空白 + , } ] : 则视为字符串结束，否则当内部引号
      let j = i + 1;
      while (j < jsonLike.length && /[ \t\r\n]/.test(jsonLike[j])) j++;
      const next = jsonLike[j] || "";
      if (next === "," || next === "}" || next === "]" || next === ":" || next === "") {
        inString = false;
        out += ch;
      } else {
        out += "「";
        // 找配对的下一个可疑引号改成 」会过于激进，只替换当前
      }
      continue;
    }
    // 字符串内裸换行 → \n
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") continue;
    out += ch;
  }
  return out;
}

function tryParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 从模型回复中抠出 JSON 对象（容错豆包偶发破 JSON） */
export function extractJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fence?.[1]?.trim() || trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  const attempts = [
    candidate,
    repairJsonText(candidate),
    softenInnerQuotes(candidate),
    repairJsonText(softenInnerQuotes(candidate)),
    softenInnerQuotes(repairJsonText(candidate)),
  ];

  for (const a of attempts) {
    const parsed = tryParseJson<T>(a);
    if (parsed && typeof parsed === "object") return parsed;
  }

  // jsonrepair：专治 LLM 破 JSON
  try {
    const repaired = jsonrepair(
      repairJsonText(softenInnerQuotes(candidate)),
    );
    const parsed = tryParseJson<T>(repaired);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* continue */
  }

  // 截到最后一个完整闭合
  const repaired = repairJsonText(softenInnerQuotes(candidate));
  const shotsClose = repaired.lastIndexOf("]");
  const objClose = repaired.lastIndexOf("}");
  if (shotsClose > 0 && objClose > shotsClose) {
    const truncated = repaired.slice(0, objClose + 1);
    try {
      const viaRepair = jsonrepair(truncated);
      const parsed = tryParseJson<T>(viaRepair);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      const parsed = tryParseJson<T>(truncated);
      if (parsed && typeof parsed === "object") return parsed;
    }
  }

  throw new Error(
    "分镜模型返回的 JSON 格式损坏，请缩短故事内容或减少镜头数后重试",
  );
}
