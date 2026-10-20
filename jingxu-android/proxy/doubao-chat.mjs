/**
 * 豆包网页对话（分镜 / 补全共用），对齐 PC doubao-web-chat 的 completion 协议。
 */

const CHAT_AID = "497858";

export function digits(len) {
  let s = "";
  while (s.length < len) {
    s += Math.floor(Math.random() * 1e10)
      .toString()
      .padStart(10, "0");
  }
  return s.slice(0, len);
}

export function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

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
  const num = String(parseInt(hash.slice(0, 12), 16) || 1).padStart(18, "0").slice(0, 18);
  const web = String(parseInt(hash.slice(12, 24), 16) || 2).padStart(18, "0").slice(0, 18);
  return {
    deviceId: `7${num}`,
    webId: `7${web}`,
    fp: `verify_${hash.slice(0, 8)}_${hash.slice(8, 16)}`,
  };
}

function queryOf(profile) {
  return new URLSearchParams({
    aid: CHAT_AID,
    real_aid: CHAT_AID,
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

export function pickDoubaoAccount(settings) {
  const accounts = settings?.jimengAccounts || [];
  const active = accounts.find((a) => a.id === settings?.activeAccountId);
  if (active?.platform === "doubao" && active.sessionId?.trim()) return active;
  return accounts.find((a) => a.enabled && a.platform === "doubao" && a.sessionId?.trim()) || null;
}

/** 账号字段是 cookieHeader（设置页粘贴），兼容旧 cookie */
export function resolveDoubaoCookie(account, settings) {
  return String(
    account?.cookieHeader ||
      account?.cookie ||
      settings?.doubaoCookie ||
      "",
  ).trim();
}

/** 设置里账号字段是 cookieHeader（不是 cookie） */
export function resolveDoubaoAuth(settings) {
  const account = pickDoubaoAccount(settings);
  const sessionId = String(
    account?.sessionId || settings?.doubaoSessionId || "",
  ).trim();
  const cookieHeader = String(
    account?.cookieHeader ||
      account?.cookie ||
      settings?.doubaoCookie ||
      "",
  ).trim();
  return { account, sessionId, cookieHeader };
}

function absorb(state, chunk) {
  if (!chunk) return;
  if (!state.content || (chunk.length >= state.content.length && chunk.startsWith(state.content))) {
    state.content = chunk;
  } else if (!state.content.endsWith(chunk)) state.content += chunk;
}

function walk(state, blocks) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    const text = block?.content?.text_block?.text || block?.text;
    if (typeof text === "string") absorb(state, text);
  }
}

function throwIfDoubaoBizError(payload) {
  if (!payload || typeof payload !== "object") return;
  const code = payload.code ?? payload.error_detail?.code;
  const msg = String(
    payload.message || payload.error_detail?.message || "",
  );
  const blob = `${code || ""} ${msg} ${JSON.stringify(payload.error_detail || {})}`;
  if (/user invalid|710012000|Invalid User/i.test(blob)) {
    throw new Error("豆包登录已失效，请到设置里重新粘贴 session");
  }
  if (/71002200[24]|rate limited|访问过于频繁|访问频繁/i.test(blob)) {
    throw new Error(
      `豆包访问过于频繁（${String(code || "限流")}）：请等待 2–3 分钟后再试，勿连续点击`,
    );
  }
  if (typeof code === "number" && code !== 0) {
    throw new Error(`豆包网页接口失败: ${code}-${msg || "未知错误"}`);
  }
}

export function parseAssistant(raw) {
  const text = String(raw || "");
  // 整包预检：限流常混在 SSE 里且无 assistant 文本
  if (/71002200[24]|rate limited/i.test(text)) {
    const m = text.match(/71002200[24]/);
    throw new Error(
      `豆包访问过于频繁（${m?.[0] || "限流"}）：请等待 2–3 分钟后再试，勿连续点击`,
    );
  }

  const state = { content: "" };
  let eventName = "";
  for (const line of text.split(/\r?\n/)) {
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
      let message = data.slice(0, 240);
      try {
        const err = JSON.parse(data);
        throwIfDoubaoBizError(err);
        message = `${err.code || ""} ${err.message || message}`.trim();
      } catch (e) {
        if (e instanceof Error && /豆包/.test(e.message)) throw e;
      }
      throw new Error(`豆包网关错误: ${message}`);
    }
    eventName = "";
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    throwIfDoubaoBizError(ev);
    const et = Number(ev.event_type);
    // STREAM_ERROR / 风控（与 PC doubao-web-chat 一致）
    if (et === 2006 || et === 2005) {
      const rawEd =
        typeof ev.event_data === "string"
          ? ev.event_data
          : JSON.stringify(ev.event_data || ev.message || "");
      throwIfDoubaoBizError(
        typeof ev.event_data === "string"
          ? (() => {
              try {
                return JSON.parse(ev.event_data);
              } catch {
                return { message: rawEd };
              }
            })()
          : ev.event_data || { message: rawEd },
      );
      throw new Error(`豆包网页接口错误: ${rawEd.slice(0, 240)}`);
    }
    let inner = ev.event_data;
    if (typeof inner === "string") {
      try {
        inner = JSON.parse(inner);
      } catch {
        inner = null;
      }
    }
    if (!inner || typeof inner !== "object") continue;
    throwIfDoubaoBizError(inner);
    walk(state, inner.content_block);
    if (inner.patch_op) walk(state, inner.patch_op.content_block);
    const message = inner.message;
    if (message?.content_block) walk(state, message.content_block);
    if (typeof message?.content === "string") {
      try {
        const parsed = JSON.parse(message.content);
        if (typeof parsed.text === "string") absorb(state, parsed.text);
        else if (typeof parsed.delta?.text === "string") absorb(state, parsed.delta.text);
      } catch {
        /* ignore */
      }
    }
  }
  if (!state.content.trim()) {
    const m = text.match(/\{[\s\S]*"(?:shots|characters)"\s*:\s*\[[\s\S]*\}/);
    if (m?.[0]) return m[0];
  }
  return state.content.trim();
}

export function firstJsonObject(raw) {
  const text = String(raw || "");
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || text.trim();
  const start = candidate.indexOf("{");
  if (start < 0) throw new Error("豆包未返回 JSON");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1"));
        }
      }
    }
  }
  throw new Error("JSON 未闭合");
}

const lastRequestAt = new Map();

async function throttle(sessionId) {
  const key = String(sessionId || "").trim() || "_";
  const gap = 1600 + Math.floor(Math.random() * 400);
  const wait = (lastRequestAt.get(key) || 0) + gap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt.set(key, Date.now());
}

/** 向 config.js 的 chat 类地址发豆包对话，返回助手纯文本 */
export async function doubaoWebChatText({
  sessionId,
  cookieHeader,
  chatUrl,
  system,
  user,
  jsonMode = true,
}) {
  const sid = String(sessionId || "").trim();
  if (!sid) throw new Error("请先在设置里登录豆包，或粘贴网页 session");
  await throttle(sid);
  const cookie =
    String(cookieHeader || "").trim() || `sessionid=${sid}; sessionid_ss=${sid}`;
  const profile = profileOf(sid);
  const target = new URL(chatUrl);
  const qs = queryOf(profile);
  target.search = target.search ? `${target.search}&${qs}` : `?${qs}`;

  let text;
  if (system && jsonMode) {
    text = `${system}\n\n---\n${user}\n\n请现在只输出 JSON 对象：`;
  } else if (system) {
    text = `${system}\n\n---\n${user}`;
  } else {
    text = user;
  }

  const payload = {
    messages: [
      {
        content: JSON.stringify({ text }),
        content_type: 2001,
        attachments: [],
        references: [],
      },
    ],
    completion_option: {
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
    },
    evaluate_option: { web_ab_params: "" },
    section_id: `26${digits(16)}`,
    conversation_id: "0",
    local_conversation_id: `local_16${digits(14)}`,
    local_message_id: uuid(),
  };

  const res = await fetch(target, {
    method: "POST",
    headers: {
      Accept: "text/event-stream, application/json",
      "Content-Type": "application/json",
      "Agw-Js-Conv": "str",
      Origin: target.origin,
      Referer: `${target.origin}/chat/`,
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`豆包网页请求失败: ${res.status} ${raw.slice(0, 180) || "空响应"}`);
  }
  const answer = parseAssistant(raw);
  if (!answer) {
    if (/71002200[24]|rate limited/i.test(raw)) {
      const m = raw.match(/71002200[24]/);
      throw new Error(
        `豆包访问过于频繁（${m?.[0] || "限流"}）：请等待 2–3 分钟后再试，勿连续点击`,
      );
    }
    throw new Error(
      `豆包返回为空（上游 ${raw.length} 字：${raw.replace(/\s+/g, " ").slice(0, 160)}）`,
    );
  }
  return answer;
}
