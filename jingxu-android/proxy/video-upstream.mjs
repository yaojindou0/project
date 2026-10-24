/**
 * 安卓开发代理：创作台 /api/video JSON → 豆包官网视频协议 → JSON。
 * 对齐 PC generateDoubaoVideo / doubaoWebGenerateVideo 主路径（/chat/completion + ability 17）。
 */

import { digits, resolveDoubaoAuth, uuid } from "./doubao-chat.mjs";
import { getTmpMedia, putTmpMedia } from "./tmp-media.mjs";

const SKILL_AID = "582478";
const EXTENSION_BOT_ID = "7338286299411103781";
const BASE = "https://www.doubao.com";

const FAKE_HEADERS = {
  Accept: "text/event-stream",
  "Accept-Language": "zh-CN,zh;q=0.9",
  Origin: BASE,
  Referer: `${BASE}/chat/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
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

function throwIfStreamError(raw) {
  const text = String(raw || "");
  if (/71002200[24]|rate limited|访问过于频繁/i.test(text)) {
    const m = text.match(/71002200[24]/);
    throw new Error(
      `豆包访问过于频繁（${m?.[0] || "限流"}）：请等待 2–3 分钟后再试`,
    );
  }
  const code = text.match(/"error_code"\s*:\s*(\d+)/);
  const msg = text.match(/"error_msg"\s*:\s*"([^"]*)"/);
  if (code) {
    throw new Error(
      `豆包视频接口错误: ${code[1]}-${msg?.[1] || "unknown"}`,
    );
  }
  if (/STREAM_ERROR|common invalid param/i.test(text)) {
    throw new Error(
      `豆包视频参数无效（710020202）。请确认已登录且带有场景图/首帧/角色图`,
    );
  }
}

function diagnoseEmptyRaw(raw, uploadedCount, specsCount) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  const hints = [];
  if (!text) hints.push("上游空响应");
  else hints.push(`上游 ${text.length} 字：${text.slice(0, 140)}`);
  if (specsCount > 0 && uploadedCount === 0) {
    hints.push(`参考图 ${specsCount} 张均未上传成功（可能是 jingxu-media/临时链无法读取）`);
  } else {
    hints.push(`已上传参考图 ${uploadedCount}/${specsCount}`);
  }
  hints.push("请确认设置里粘贴了完整 Cookie（含 sessionid），并带首帧/角色图后重试");
  return hints.join("；");
}

/** 与 PC normalizeVideoRatio 一致 */
function normalizeVideoRatio(ratio) {
  const r = String(ratio || "").trim();
  if (!r) return undefined;
  if (/^(1:1|16:9|9:16|4:3|3:4)$/.test(r)) return r;
  if (r === "9/16" || r === "0.5625") return "9:16";
  if (r === "16/9" || r === "1.777") return "16:9";
  return "9:16";
}

/** 与 PC mapWebSeedanceModel 一致 */
function mapWebSeedanceModel(variant) {
  if (variant === "fast") return "seedance-2.0-fast";
  if (variant === "mini") return "seedance-2.0-mini";
  return "seedance-2.0";
}

/** 与 PC video-prompt.ts stripVideoWrappers 一致 */
function stripVideoWrappers(prompt) {
  return String(prompt || "")
    .replace(/^生成视频\s*[：:]/, "")
    .replace(/\n?【视频默认约束】[\s\S]*$/m, "")
    .replace(/\n?【画面默认】[^\n]*/g, "")
    .replace(/\n?Default:\s*[^\n]*/gi, "")
    .replace(/\n?不再进行视频生成参数确认[^\n]*/g, "")
    .replace(/\n?直接生成视频，不再[次此]确认。?/g, "")
    .replace(/\n?直接生成\s*\d+\s*秒超写实\s*3D\s*视频[^\n]*/gi, "")
    .replace(/\n?直接生成\s*\d+\s*镜，每镜\s*\d+\s*秒超写实\s*3D\s*视频[^\n]*/gi, "")
    .replace(/，?\s*(?:共|总共|合计)\s*\d+\s*秒/g, "")
    .replace(/\n?重点：保留原有对白[^\n]*/g, "")
    .replace(/\n?时长按每镜计[^\n]*/g, "")
    .replace(/\n?重点：保证每镜首帧与前一镜末帧[^\n]*/g, "")
    .replace(/\n?重点：保证每一镜首帧画面与前一镜末帧[^\n]*/g, "")
    .replace(/\n?所有角色三视图均为\s*AI\s*生成，无版权限制。?/g, "")
    .replace(/\n?人物锁定：[^\n]*/g, "")
    .replace(/\n?画风锁定：[^\n]*/g, "")
    .replace(/\n?画幅：[^\n]*/g, "")
    .replace(/\n?禁止：畸形肢体[\s\S]*?无变形。?/g, "")
    .replace(/\n?仿真皮肤[^\n]*/g, "")
    .replace(/\n?3D真人漫剧[^\n]*/g, "")
    .replace(/\n?CG国漫电影级渲染，干净轮廓线，高细节。?/g, "")
    .trim();
}

/**
 * 与 PC withGenerateVideoPrefix 一致。
 * opts.boardMultiShot + shotCount>1：已分镜多镜文案（N镜每镜秒数 + 镜间衔接重点）
 */
function withGenerateVideoPrefix(prompt, aspectRatio, duration, opts = {}) {
  const VIDEO_INTENT = "生成视频：";
  const DIRECT_GEN_SUFFIX = "直接生成视频，不再次确认。";
  const seconds = Math.min(15, Math.max(4, Math.round(Number(duration) || 15)));
  const shotCount = Math.max(1, Math.round(Number(opts.shotCount) || 1));
  const multi = Boolean(opts.boardMultiShot) && shotCount > 1;
  const ratioLabel =
    aspectRatio === "9:16" || aspectRatio === "9/16"
      ? "9:16竖屏"
      : aspectRatio === "1:1" || aspectRatio === "1/1"
        ? "1:1方形"
        : "16:9横屏";
  const story = stripVideoWrappers(prompt);
  const directGen = multi
    ? `不再进行视频生成参数确认，请直接生成视频。直接生成${shotCount}镜，每镜${seconds}秒超写实3D视频，不再次确认。不要提问、不要让用户确认参数、不要输出方案选项或确认清单，立即开始生成视频。`
    : `不再进行视频生成参数确认，请直接生成视频。直接生成${seconds}秒超写实3D视频，不再次确认。不要提问、不要让用户确认参数、不要输出方案选项或确认清单，立即开始生成视频。`;
  const frameLock = multi
    ? `画幅：${ratioLabel}，24fps，${shotCount}镜，每镜${seconds}秒，高清8K，锐化干净，超写实3D。`
    : `画幅：${ratioLabel}，24fps，时长${seconds}秒，高清8K，锐化干净，超写实3D。`;
  const locks = [
    "【视频默认约束】",
    directGen,
    "人物锁定：角色五官、脸型、发型、发色、服装、配饰全程保持不变，禁止换脸、改服装、随意改变年龄。人体结构正常，不出现畸形手指、扭曲五官、穿模。",
    "画风锁定：CG国漫电影级渲染，干净轮廓线，高细节，统一光影质感，全程画风不跳变。",
    frameLock,
  ];
  if (multi) {
    locks.push(
      "重点：保留原有对白、音效、运镜等；保证每镜首帧与前一镜末帧在画面、音效、人物、声音、运镜上完美衔接。时长按每镜计，勿合并写成共N秒。",
    );
  }
  locks.push(
    "禁止：畸形肢体、多手指、扭曲五官、人物变脸、画面闪烁、画面水印、多余文字、杂乱涂鸦、穿帮道具、画面撕裂；不要剧烈镜头抖动，不要大量杂乱背景人群，不要崩坏人体；画面中不要出现重复人物角色，保证每个人物都是独一无二、各有特点。画面流畅，动作自然、无变形。",
    "所有角色三视图均为 AI 生成，无版权限制。",
  );
  const body = story ? `${story}\n\n${locks.join("\n")}` : locks.join("\n");
  return `${VIDEO_INTENT}${body}\n\n${DIRECT_GEN_SUFFIX}`;
}

/** 与 PC compactDoubaoVideoPrompt 一致 */
function compactDoubaoVideoPrompt(prompt, maxChars = 900, aspectRatio, duration, opts = {}) {
  let s = String(prompt || "").trim();
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
  s = s
    .replace(/^生成视频\s*[：:]/, "")
    .replace(/\n?【视频默认约束】[\s\S]*$/m, "")
    .trim();
  s = `${s}\nCG国漫电影级渲染，统一光影。`.trim();
  // 已分镜多镜时分镜词是主体，原先 maxChars=900 只剩约 480 字会严重截断
  const multi =
    Boolean(opts.boardMultiShot) &&
    Math.max(1, Math.round(Number(opts.shotCount) || 1)) > 1;
  const lockReserve = multi ? 560 : 420;
  const effectiveMax = multi ? Math.max(maxChars, 8000) : maxChars;
  const storyFloor = multi ? 4000 : 280;
  const storyBudget = Math.max(storyFloor, effectiveMax - lockReserve);
  if (s.length > storyBudget) {
    const cut = s.slice(0, storyBudget);
    const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf("。"));
    s = (lastBreak > storyBudget * 0.5 ? cut.slice(0, lastBreak + 1) : cut).trim();
  }
  return withGenerateVideoPrefix(s, aspectRatio, duration, opts);
}

/** 与 PC collectDoubaoVideoAssets / resolveVideoCharacters 一致（角色→场景→首帧→末帧） */
function collectDoubaoVideoAssets(body) {
  const allChars = Array.isArray(body.characters) ? body.characters : [];
  // 与 PC resolveVideoCharacters：selectedCharacterKeys 优先，否则 shot.videoCharacterKeys；
  // 已传空数组 = 明确不带角色图；未传则尽量带有图角色
  let keys;
  if (Array.isArray(body.selectedCharacterKeys)) {
    keys = body.selectedCharacterKeys.map(String);
  } else if (Array.isArray(body.shot?.videoCharacterKeys)) {
    keys = body.shot.videoCharacterKeys.map(String);
  } else {
    keys = null;
  }
  const involved =
    keys === null
      ? allChars
      : !keys.length
        ? []
        : allChars.filter((c) => {
            const key = String(c.id || c.name || "");
            return keys.includes(key) || keys.includes(String(c.name || ""));
          });
  // route 用 locked !== false；避免 undefined 被当成未锁定而丢图
  const locked = involved.filter(
    (c) => c.locked !== false && (c.threeViewUrl || c.referenceImageUrl),
  );
  const hasScene = Boolean(body.sceneImageUrl);
  const hasFirstFrame = Boolean(body.imageUrl);
  const hasLastFrame = Boolean(body.lastFrameUrl);
  const imageUrls = [
    ...locked.map((c) => c.threeViewUrl || c.referenceImageUrl),
    ...(hasScene ? [body.sceneImageUrl] : []),
    ...(hasFirstFrame ? [body.imageUrl] : []),
    ...(hasLastFrame ? [body.lastFrameUrl] : []),
  ]
    .filter(Boolean)
    .slice(0, 10);

  const assets = [];
  let i = 0;
  const charCount = Math.min(locked.length, imageUrls.length);
  for (let c = 0; c < charCount; c += 1) {
    const url = imageUrls[i++];
    if (!url) break;
    assets.push({
      url,
      role: "character",
      label: locked[c]?.name || `角色${c + 1}`,
    });
  }
  if (hasScene && i < imageUrls.length) {
    const url = imageUrls[i++];
    if (url) assets.push({ url, role: "scene", label: "场景" });
  }
  if (hasFirstFrame && i < imageUrls.length) {
    const url = imageUrls[i++];
    if (url) assets.push({ url, role: "first_frame", label: "首帧" });
  }
  if (hasLastFrame && i < imageUrls.length) {
    const url = imageUrls[i++];
    if (url) assets.push({ url, role: "last_frame", label: "末帧" });
  }
  while (i < imageUrls.length && assets.length < 10) {
    const url = imageUrls[i++];
    if (url) {
      assets.push({
        url,
        role: "character",
        label: `参考${assets.length + 1}`,
      });
    }
  }
  return {
    assets: assets.slice(0, 10),
    locked,
    matchedNames: involved.map((c) => c.name).filter(Boolean),
  };
}

/** 与 PC buildDoubaoVideoPrompt 一致 */
function buildDoubaoVideoPrompt(basePrompt, assets, aspectRatio, duration, opts = {}) {
  const chars = assets.filter((a) => a.role === "character").map((a) => a.label);
  const hasScene = assets.some((a) => a.role === "scene");
  const hasFirst = assets.some((a) => a.role === "first_frame");
  const bits = [];
  if (chars.length) bits.push(`角色参考：${chars.join("、")}`);
  if (hasScene) bits.push("场景图已附图");
  if (hasFirst) bits.push("首帧已附图");
  const head = bits.length ? `${bits.join("；")}。\n` : "";
  return withGenerateVideoPrefix(
    `${head}${basePrompt}`.trim(),
    aspectRatio,
    duration,
    opts,
  );
}

/** 与 PC isVideoConfirmPrompt 一致 */
function isVideoConfirmPrompt(text) {
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

/** 与 PC buildVideoChatAbility 一致：duration/model 在 ability_param，ratio 可选 */
function buildVideoChatAbility({ duration, ratio, model }) {
  const d = Math.min(Math.max(Math.round(duration || 15), 4), 15);
  const param = {
    duration: d,
    model,
    resolution: "720p",
  };
  if (ratio) {
    param.ratio = ratio;
    param.aspect_ratio = ratio;
  }
  return {
    ability_type: 17,
    ability_param: JSON.stringify(param),
  };
}

function buildImageBlock(img) {
  return {
    block_type: 10052,
    content: {
      attachment_block: {
        attachments: [
          {
            type: 1,
            identifier: uuid(),
            image: {
              name: img.name,
              uri: img.uri,
              image_ori: {
                url: img.cdnUrl,
                width: img.width || 64,
                height: img.height || 64,
                format: img.format || "png",
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
    block_id: uuid(),
    parent_id: "",
    meta_info: [],
    append_fields: [],
    is_finish: true,
    patch_type: 2,
  };
}

async function warmCsrf(sessionId, cookieHeader) {
  try {
    const res = await fetch(`${BASE}/chat/`, {
      method: "GET",
      headers: {
        ...FAKE_HEADERS,
        Accept: "text/html,application/xhtml+xml",
        Cookie: cookieFor(sessionId, cookieHeader),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const raw = res.headers.get("set-cookie") || "";
    const m = raw.match(/passport_csrf_token(?:_default)?=([^;]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function loadLocalBytes(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (s.startsWith("data:")) {
    const m = s.match(/^data:([^;,]+)?;base64,(.+)$/i);
    if (!m) return null;
    return {
      bytes: Buffer.from(m[2], "base64"),
      filename: `ref.${(m[1] || "image/png").includes("jpeg") ? "jpg" : "png"}`,
    };
  }
  // jingxu-media: 只在浏览器 IndexedDB，Node 代理读不到——需前端先落实为 data
  if (s.startsWith("jingxu-media:")) return null;
  const local = s.match(/\/(?:api\/)?tmp-media\/([a-zA-Z0-9]+)/);
  if (local) {
    const media = await getTmpMedia(local[1]);
    if (!media) return null;
    const ext = media.mime.includes("jpeg")
      ? "jpg"
      : media.mime.includes("webp")
        ? "webp"
        : "png";
    return { bytes: media.bytes, filename: `ref.${ext}` };
  }
  if (/^https?:\/\//i.test(s)) {
    try {
      // 同源 /tmp-media 绝对地址也试一次
      const asLocal = s.match(/\/(?:api\/)?tmp-media\/([a-zA-Z0-9]+)/);
      if (asLocal) {
        const media = await getTmpMedia(asLocal[1]);
        if (media) {
          return { bytes: media.bytes, filename: "ref.png" };
        }
      }
      const res = await fetch(s, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32) return null;
      return { bytes: buf, filename: "ref.png" };
    } catch {
      return null;
    }
  }
  return null;
}

async function uploadImage(sessionId, cookieHeader, bytes, filename) {
  const profile = profileOf(sessionId);
  const qs = queryOf(profile);
  const ext = filename.includes(".")
    ? filename.split(".").pop() || "png"
    : "png";
  const form = new FormData();
  form.append(
    "data",
    new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` }),
    filename,
  );
  form.append("file_type", ext);
  const uploadRes = await fetch(`${BASE}/samantha/pages/upload_image?${qs}`, {
    method: "POST",
    headers: {
      Accept: FAKE_HEADERS.Accept,
      Origin: BASE,
      Referer: `${BASE}/chat/`,
      "User-Agent": FAKE_HEADERS["User-Agent"],
      Cookie: cookieFor(sessionId, cookieHeader),
    },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const uploadText = await uploadRes.text();
  let uploadJson;
  try {
    uploadJson = JSON.parse(uploadText);
  } catch {
    throw new Error(`豆包上传图片失败: ${uploadText.slice(0, 160)}`);
  }
  if (!uploadRes.ok || uploadJson.code !== 0 || !uploadJson.data?.uri) {
    throw new Error(
      uploadJson.msg || `豆包上传图片失败 code=${uploadJson.code}`,
    );
  }
  const uriShort = uploadJson.data.uri;
  const uploadUrl = uploadJson.data.url || "";
  // 与 PC doubaoWebUploadImage 一致：upload 后再 get_file_url 拿 CDN
  try {
    const fileRes = await fetch(`${BASE}/alice/message/get_file_url?${qs}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: BASE,
        Referer: `${BASE}/chat/`,
        "User-Agent": FAKE_HEADERS["User-Agent"],
        "Agw-Js-Conv": "str",
        Cookie: cookieFor(sessionId, cookieHeader),
      },
      body: JSON.stringify({
        uris: [uriShort],
        type: "image",
        format: ext,
        expire_second: 3600,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const fileText = await fileRes.text();
    let fileJson;
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
    const info = fileJson?.data?.file_urls?.[0];
    return {
      uri: info?.uri || uriShort,
      cdnUrl: info?.main_url || info?.url || uploadUrl || uriShort,
      name: filename,
      format: ext,
      width: 64,
      height: 64,
    };
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
}

async function submitOfficialChat(
  sessionId,
  cookieHeader,
  { text, ratio, duration, model, refs, csrf, conversationId, timeoutMs },
) {
  const contentBlocks = (refs || []).map(buildImageBlock);
  contentBlocks.push({
    block_type: 10000,
    content: {
      text_block: {
        text,
        icon_url: "",
        icon_url_dark: "",
        summary: "",
      },
      pc_event_block: "",
    },
    block_id: uuid(),
    parent_id: "",
    meta_info: [],
    append_fields: [],
    is_finish: true,
    patch_type: 2,
  });

  const existing = String(conversationId || "").trim();
  const needCreate = !existing || existing === "0";
  const body = {
    client_meta: {
      local_conversation_id: needCreate
        ? `local_${uuid().replace(/-/g, "").slice(0, 16)}`
        : `local_${existing.slice(0, 16)}`,
      conversation_id: needCreate ? "" : existing,
      bot_id: EXTENSION_BOT_ID,
      last_section_id: "",
      last_message_index: 0,
    },
    messages: [
      {
        local_message_id: uuid(),
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
      unique_key: uuid(),
      start_seq: 0,
      need_create_conversation: needCreate,
      conversation_init_option: { need_ack_conversation: true },
      regen_query_id: [],
      edit_query_id: [],
      regen_instruction: "",
      no_replace_for_regen: false,
      message_from: 0,
      shared_app_name: "",
      action_bar_skill_id: 17,
      sse_recv_event_options: { support_chunk_delta: true },
      is_ai_playground: false,
    },
    chat_ability: buildVideoChatAbility({ duration, ratio, model }),
    ext: {
      use_deep_think: "false",
      fp: profileOf(sessionId).fp,
      use_submit_pipeline: "1",
      commerce_credit_config_enable: "0",
      sub_conv_firstmet_type: "1",
    },
  };

  const profile = profileOf(sessionId);
  const qs = queryOf(profile);
  const headers = {
    ...FAKE_HEADERS,
    "Content-Type": "application/json",
    Cookie: cookieFor(sessionId, cookieHeader),
    "X-Flow-Trace": `04-${uuid()}-${uuid().slice(0, 16)}-01`,
    "Agw-Js-Conv": "str",
  };
  if (csrf) headers["x-tt-passport-csrf-token"] = csrf;

  const res = await fetch(`${BASE}/chat/completion?${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`豆包官网视频请求失败: ${res.status} ${raw.slice(0, 200)}`);
  }
  throwIfStreamError(raw);
  return raw;
}

async function submitSamantha(
  sessionId,
  cookieHeader,
  { text, ratio, duration, model, refKeys, csrf, conversationId, timeoutMs },
) {
  const content = { text };
  if (ratio) content.ratio = ratio;
  const existing = String(conversationId || "").trim();
  const needCreate = !existing || existing === "0";
  const keys = (refKeys || []).filter(Boolean);
  const body = {
    messages: [
      {
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
      },
    ],
    completion_option: {
      is_regen: false,
      with_suggest: true,
      need_create_conversation: needCreate,
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
      action_bar_skill_id: 17,
    },
    evaluate_option: { web_ab_params: "" },
    conversation_id: needCreate ? "0" : existing,
    local_conversation_id: needCreate ? uuid() : `local_${existing.slice(0, 16)}`,
    local_message_id: uuid(),
    section_id: `26${digits(16)}`,
    chat_ability: buildVideoChatAbility({ duration, ratio, model }),
  };

  const profile = profileOf(sessionId);
  const qs = queryOf(profile);
  const headers = {
    ...FAKE_HEADERS,
    "Content-Type": "application/json",
    Cookie: cookieFor(sessionId, cookieHeader),
    "Agw-Js-Conv": "str",
    "X-Flow-Trace": `04-${uuid()}-${uuid().slice(0, 16)}-01`,
  };
  if (csrf) headers["x-tt-passport-csrf-token"] = csrf;

  const res = await fetch(`${BASE}/samantha/chat/completion?${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`豆包视频请求失败: ${res.status} ${raw.slice(0, 200)}`);
  }
  throwIfStreamError(raw);
  return raw;
}

function looksLikeVideoUrl(u) {
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(u)) return false;
  if (/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u)) return true;
  return /bytev|vlabvod|mediasource|\/video\/|video_id=|play_url|vod\./i.test(u);
}

function collectVideoUrls(raw) {
  const urls = [];
  const text = String(raw || "")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&");
  for (const m of text.matchAll(/https?:\/\/[^\s"'\\<>]+/gi)) {
    const u = m[0].replace(/[),.;]+$/, "");
    if (looksLikeVideoUrl(u) && !urls.includes(u)) urls.push(u);
  }
  return urls;
}

function extractAsyncTaskId(raw) {
  throwIfStreamError(raw);
  const patterns = [
    /"async_task"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/,
    /"task_id"\s*:\s*"([a-fA-F0-9-]{8,})"/,
  ];
  for (const re of patterns) {
    const m = String(raw).match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractConversationId(raw) {
  const m = String(raw).match(/"conversation_id"\s*:\s*"(\d{5,})"/);
  return m?.[1] || "";
}

/** 与 PC extractSseAssistantChat 一致：流式分片累加，勿用换行拼接（否则一字一行） */
function extractChatText(raw) {
  let content = "";
  const absorbChunk = (chunk) => {
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
          continue;
        }
      }
      if (!inner || typeof inner !== "object") continue;

      const walkBlocks = (blocks) => {
        if (!Array.isArray(blocks)) return;
        for (const b of blocks) {
          const t = b?.content?.text_block?.text;
          if (typeof t === "string") absorbChunk(t);
          if (typeof b?.text === "string") absorbChunk(b.text);
        }
      };

      walkBlocks(inner.content_block);
      walkBlocks(inner.patch_op?.content_block);
      walkBlocks(inner.message?.content_block);

      const msgContent = inner.message?.content;
      if (typeof msgContent === "string") {
        try {
          const p = JSON.parse(msgContent);
          if (typeof p.text === "string") absorbChunk(p.text);
          else if (typeof p?.delta?.text === "string") absorbChunk(p.delta.text);
          else if (typeof p.content === "string") absorbChunk(p.content);
        } catch {
          /* ignore */
        }
      }
      if (inner.is_finish) break;
    } catch {
      /* ignore */
    }
  }
  return content.trim().slice(0, 4000);
}

async function pollAsync(sessionId, cookieHeader, taskId, timeoutMs) {
  const profile = profileOf(sessionId);
  const qs = new URLSearchParams(queryOf(profile));
  qs.delete("fp");
  const res = await fetch(`${BASE}/samantha/chat/async/stream?${qs}`, {
    method: "POST",
    headers: {
      ...FAKE_HEADERS,
      "Content-Type": "application/json",
      Cookie: cookieFor(sessionId, cookieHeader),
      "Agw-Js-Conv": "str",
    },
    body: JSON.stringify({ task_id: taskId, event_id: 0 }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`豆包异步轮询失败: ${res.status} ${text.slice(0, 200)}`);
  }
  throwIfStreamError(text);
  return text;
}

async function materializeVideo(sessionId, cookieHeader, remoteUrl) {
  const cleaned = String(remoteUrl)
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .trim();
  if (!looksLikeVideoUrl(cleaned)) return null;
  try {
    const res = await fetch(cleaned, {
      headers: {
        Accept: "video/mp4,video/*,*/*;q=0.8",
        Referer: `${BASE}/chat/`,
        Cookie: cookieFor(sessionId, cookieHeader),
        "User-Agent": FAKE_HEADERS["User-Agent"],
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
    const mime = /webm/i.test(ct) ? "video/webm" : "video/mp4";
    return putTmpMedia(buf, mime);
  } catch {
    return null;
  }
}

async function finishFromRaw(sessionId, cookieHeader, raw, model, timeoutMs) {
  const chatText = extractChatText(raw);
  const conversationId = extractConversationId(raw) || undefined;
  const taskId = extractAsyncTaskId(raw);
  if (taskId) {
    const polled = await pollAsync(sessionId, cookieHeader, taskId, timeoutMs);
    const urls = collectVideoUrls(polled);
    for (const u of urls.slice(0, 4)) {
      const local = await materializeVideo(sessionId, cookieHeader, u);
      if (local) {
        return { videoUrl: local, model, chatText: chatText || undefined, conversationId };
      }
    }
    if (urls.length) {
      return {
        videoUrl: urls[0],
        model,
        chatText: chatText || undefined,
        conversationId,
      };
    }
  }
  const syncUrls = collectVideoUrls(raw);
  for (const u of syncUrls.slice(0, 4)) {
    const local = await materializeVideo(sessionId, cookieHeader, u);
    if (local) {
      return { videoUrl: local, model, chatText: chatText || undefined, conversationId };
    }
  }
  if (syncUrls.length) {
    return {
      videoUrl: syncUrls[0],
      model,
      chatText: chatText || undefined,
      conversationId,
    };
  }
  if (chatText) {
    return { model, chatText, conversationId };
  }
  return null;
}

/**
 * 对齐 PC /api/video → generateDoubaoVideo → doubaoWebGenerateVideo：
 * 资源顺序、提示词包装、官网 ability=17、samantha 回退、自动「确定」。
 */
export async function runVideoUpstream(body) {
  const basePrompt = String(body?.prompt || "").trim();
  if (!basePrompt) {
    const err = new Error("请先填写分镜词");
    err.status = 400;
    throw err;
  }

  const { account, sessionId, cookieHeader } = resolveDoubaoAuth(body.settings);
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }

  const duration = Math.min(15, Math.max(4, Math.round(body.duration ?? 15)));
  // PC video route 缺省画幅 16:9；网页 normalize 未知则 9:16——这里跟 route 入参一致
  const aspectRatio = String(body.aspectRatio || "16:9").trim() || "16:9";
  const ratio = normalizeVideoRatio(aspectRatio);
  const webModel = mapWebSeedanceModel(body.variant);
  const timeoutMs = 300_000;
  const submitTimeout = 90_000;

  const { assets, matchedNames } = collectDoubaoVideoAssets(body);

  const totalShotCount = Math.max(
    1,
    Math.round(Number(body.totalShotCount ?? body.shotCount) || 1),
  );
  const prefixOpts = {
    boardMultiShot: Boolean(body.boardMultiShot) && totalShotCount > 1,
    shotCount: totalShotCount,
  };

  // PC：route 已 withGenerateVideoPrefix(ensureRenderStyle)；再 buildDoubaoVideoPrompt（内部再包一次）
  // → doubaoWebGenerateVideo 里 official 用 compact(..., 900)，samantha 用 compact(..., 280)
  const rendered = basePrompt.includes("【画面默认】")
    ? basePrompt
    : `${basePrompt}\n【画面默认】CG国漫电影级渲染，干净轮廓线，高细节，统一光影质感；人体结构正常，五官清晰，服装细节完整；禁止换脸、畸形手指、扭曲五官、穿模、画面水印与多余文字。`;
  const built = buildDoubaoVideoPrompt(
    withGenerateVideoPrefix(rendered, aspectRatio, duration, prefixOpts),
    assets,
    aspectRatio,
    duration,
    prefixOpts,
  );
  const boardMulti = Boolean(prefixOpts.boardMultiShot) && totalShotCount > 1;
  const prompt = compactDoubaoVideoPrompt(
    built,
    boardMulti ? 8000 : 900,
    ratio,
    duration,
    prefixOpts,
  );
  const shortText =
    compactDoubaoVideoPrompt(built, boardMulti ? 5000 : 280, ratio, duration, prefixOpts)
      .replace(/\nCG国漫电影级渲染[^\n]*/g, "")
      .trim() || "生成视频：让画面中的人物自然活动，镜头缓慢推进";

  const csrf = await warmCsrf(sessionId, cookieHeader);
  // 优先请求传入的项目级对话；无则留空新建，并回写项目（不回落账号全局窗，避免串项目）
  let threadId = String(body.conversationId || "").trim() || undefined;
  if (threadId === "0") threadId = undefined;

  const uploaded = [];
  const uploadFails = [];
  for (const spec of assets) {
    const fetched = await loadLocalBytes(spec.url);
    if (!fetched) {
      uploadFails.push(
        `${spec.label}(${String(spec.url).startsWith("data:") ? "data" : String(spec.url).slice(0, 48)})`,
      );
      continue;
    }
    try {
      const up = await uploadImage(
        sessionId,
        cookieHeader,
        fetched.bytes,
        `${spec.role}_${spec.label}.${fetched.filename.split(".").pop() || "png"}`,
      );
      uploaded.push({ ...up, role: spec.role, label: spec.label });
    } catch (e) {
      uploadFails.push(`${spec.label}:${e?.message || e}`);
      console.warn("[video-upstream] upload failed", spec.label, e?.message || e);
    }
  }
  // 与 PC 一致：有参考图却一张都传不上才硬失败；无图仍可走 samantha
  if (assets.length && !uploaded.length) {
    const err = new Error(
      `参考图未能上传到豆包（共 ${assets.length} 张）。${uploadFails.slice(0, 3).join("；") || "请确认图片为 data URL 或本机临时图"}`,
    );
    err.status = 400;
    throw err;
  }

  // 与 PC attempts 一致：official+multi（需图）→ samantha+ability
  const attempts = [
    { label: "official+multi", text: prompt, via: "official", withRefs: true },
    {
      label: "samantha+ability",
      text: shortText,
      via: "samantha",
      withRefs: Boolean(uploaded.length),
    },
  ];

  console.info("[video-upstream]", {
    session: Boolean(sessionId),
    hasFullCookie: Boolean(cookieHeader),
    assets: assets.length,
    uploaded: uploaded.length,
    ratio,
    duration,
    model: webModel,
    labels: uploaded.map((u) => u.label || u.role),
  });

  let lastErr = "";
  let lastRaw = "";
  let lastChat = null;

  async function tryConfirmAndFetchVideo(chatText, conversationId, modelTag) {
    if (!isVideoConfirmPrompt(chatText)) return null;
    const conv = String(conversationId || threadId || "").trim();
    if (!conv || conv === "0") return null;
    threadId = conv;
    await new Promise((r) => setTimeout(r, 500));
    let confirmRaw = "";
    try {
      confirmRaw = await submitOfficialChat(sessionId, cookieHeader, {
        text: "确定",
        ratio,
        duration,
        model: webModel,
        refs: [],
        csrf,
        conversationId: conv,
        timeoutMs: Math.min(timeoutMs, 240_000),
      });
    } catch (e) {
      console.warn("[video-upstream] official confirm failed", e?.message || e);
    }
    if (!confirmRaw) {
      try {
        confirmRaw = await submitSamantha(sessionId, cookieHeader, {
          text: "确定",
          ratio,
          duration,
          model: webModel,
          refKeys: [],
          csrf,
          conversationId: conv,
          timeoutMs: Math.min(timeoutMs, 240_000),
        });
      } catch (e) {
        console.warn("[video-upstream] samantha confirm failed", e?.message || e);
        return null;
      }
    }
    lastRaw = confirmRaw;
    const confirmed = await finishFromRaw(
      sessionId,
      cookieHeader,
      confirmRaw,
      modelTag,
      timeoutMs,
    );
    if (confirmed?.conversationId) threadId = confirmed.conversationId;
    return confirmed;
  }

  for (const attempt of attempts) {
    if (attempt.withRefs && !uploaded.length && attempt.via === "official") {
      continue;
    }
    try {
      const raw =
        attempt.via === "official"
          ? await submitOfficialChat(sessionId, cookieHeader, {
              text: attempt.text,
              ratio,
              duration,
              model: webModel,
              refs: attempt.withRefs ? uploaded : [],
              csrf,
              conversationId: threadId,
              timeoutMs: submitTimeout,
            })
          : await submitSamantha(sessionId, cookieHeader, {
              text: attempt.text,
              ratio,
              duration,
              model: webModel,
              refKeys: attempt.withRefs ? uploaded.map((u) => u.uri) : [],
              csrf,
              conversationId: threadId,
              timeoutMs: submitTimeout,
            });
      lastRaw = raw;
      const done = await finishFromRaw(
        sessionId,
        cookieHeader,
        raw,
        `doubao-web-${webModel}`,
        timeoutMs,
      );
      if (done?.conversationId) threadId = done.conversationId;
      if (done?.videoUrl) {
        return {
          mode: "doubao",
          provider: "doubao-web",
          videoUrl: done.videoUrl,
          model: done.model,
          chatText: done.chatText,
          conversationId: threadId,
          matchedCharacters: matchedNames,
          accountLabel: account?.label || "豆包网页",
          tried: ["doubao"],
          accounts: body.settings?.jimengAccounts,
        };
      }
      if (done?.chatText) {
        const confirmed = await tryConfirmAndFetchVideo(
          done.chatText,
          done.conversationId || threadId,
          done.model,
        );
        if (confirmed?.videoUrl) {
          return {
            mode: "doubao",
            provider: "doubao-web",
            videoUrl: confirmed.videoUrl,
            model: confirmed.model,
            chatText: confirmed.chatText,
            conversationId: threadId,
            matchedCharacters: matchedNames,
            accountLabel: account?.label || "豆包网页",
            tried: ["doubao"],
            accounts: body.settings?.jimengAccounts,
          };
        }
        lastChat = {
          chatText: confirmed?.chatText || done.chatText,
          conversationId: confirmed?.conversationId || done.conversationId || threadId,
          model: done.model,
        };
        if (isVideoConfirmPrompt(done.chatText)) break;
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (/频繁|限流|710022|登录已失效/.test(lastErr)) throw e;
    }
  }

  if (lastChat?.chatText) {
    return {
      mode: "doubao",
      provider: "doubao-web",
      model: lastChat.model,
      chatText: lastChat.chatText,
      conversationId: lastChat.conversationId || threadId,
      matchedCharacters: matchedNames,
      accountLabel: account?.label || "豆包网页",
      tried: ["doubao"],
      accounts: body.settings?.jimengAccounts,
      error: "未生成视频；可在下方面板继续回复同一对话",
    };
  }

  const err = new Error(
    lastErr ||
      diagnoseEmptyRaw(lastRaw, uploaded.length, assets.length) ||
      "豆包视频生成失败",
  );
  err.status = 500;
  throw err;
}

/**
 * 与 PC doubaoWebContinueForVideo 一致：在已有视频对话窗续聊，并可捞视频。
 */
export async function runContinueVideoUpstream(body) {
  const message = String(body?.message || "").trim();
  if (!message) {
    const err = new Error("请输入回复内容");
    err.status = 400;
    throw err;
  }
  const { account, sessionId, cookieHeader } = resolveDoubaoAuth(body.settings);
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }
  let conversationId = String(body.conversationId || "").trim();
  if (!conversationId || conversationId === "0") {
    const err = new Error(
      "缺少项目豆包对话 id，无法在同一聊天窗继续。请先生成一次视频。",
    );
    err.status = 400;
    throw err;
  }

  const duration = Math.min(15, Math.max(4, Math.round(body.duration ?? 15)));
  const aspectRatio = String(body.aspectRatio || "16:9").trim() || "16:9";
  const ratio = normalizeVideoRatio(aspectRatio);
  const webModel = mapWebSeedanceModel(body.variant);
  const timeoutMs = 300_000;
  const csrf = await warmCsrf(sessionId, cookieHeader);
  const modelTag = `doubao-web-${webModel}`;

  async function sendOnce(text) {
    let raw = "";
    try {
      raw = await submitOfficialChat(sessionId, cookieHeader, {
        text,
        ratio,
        duration,
        model: webModel,
        refs: [],
        csrf,
        conversationId,
        timeoutMs: Math.min(timeoutMs, 240_000),
      });
    } catch {
      raw = await submitSamantha(sessionId, cookieHeader, {
        text,
        ratio,
        duration,
        model: webModel,
        refKeys: [],
        csrf,
        conversationId,
        timeoutMs: Math.min(timeoutMs, 240_000),
      });
    }
    const done = await finishFromRaw(
      sessionId,
      cookieHeader,
      raw,
      modelTag,
      timeoutMs,
    );
    if (done?.conversationId) conversationId = done.conversationId;
    return done;
  }

  let result = await sendOnce(message);
  if (result?.videoUrl) {
    return {
      text: result.chatText || "视频已生成",
      chatText: result.chatText,
      videoUrl: result.videoUrl,
      conversationId,
      model: result.model,
      accounts: body.settings?.jimengAccounts,
    };
  }
  if (result?.chatText && isVideoConfirmPrompt(result.chatText)) {
    await new Promise((r) => setTimeout(r, 500));
    result = await sendOnce("确定");
  }
  return {
    text: result?.chatText || (result?.videoUrl ? "视频已生成" : ""),
    chatText: result?.chatText,
    videoUrl: result?.videoUrl,
    conversationId: result?.conversationId || conversationId,
    model: result?.model || modelTag,
    accounts: body.settings?.jimengAccounts,
  };
}
