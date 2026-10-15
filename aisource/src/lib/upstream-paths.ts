/**
 * 原项目 /api 所代理的上游路径（jingxu-html / jingxu-web 对外统一用这些，不用 /api）。
 * enrich / chat-reply 与 script 上游相同，故用可区分的扩展路径挂到同一实现。
 */
export const UPSTREAM_PATHS = {
  /** 分镜 / 对话 JSON → www.doubao.com/samantha/chat/completion */
  script: "/samantha/chat/completion",
  /** 角色/场景 enrichment（上游同 completion，本站扩展路径） */
  enrich: "/samantha/chat/enrich",
  /** 续聊（上游同 completion，本站扩展路径） */
  chatReply: "/samantha/chat/reply",
  /** 生图 → 方舟 images/generations（无 Key 时服务端再走豆包网页） */
  image: "/api/v3/images/generations",
  /** 视频 → 豆包 /chat/completion（服务端可回退 samantha / 方舟 tasks） */
  video: "/chat/completion",
  /** 方舟视频任务（可选独立 endpoint） */
  videoArk: "/api/v3/contents/generations/tasks",
  authSendCode: "/passport/web/send_code/",
  authLogin: "/passport/web/sms_login/",
  authCheckSession: "/passport/account/info/v2/",
  /** 本机临时媒体，非外网上游 */
  tmpMediaPrefix: "/tmp-media",
  doubaoCheck: "/passport/account/info/v2/",
  jimengCheck: "/jimeng/check",
} as const;

/** 上游完整 Origin（文档 / 逐项配置示例） */
export const UPSTREAM_ORIGINS = {
  doubao: "https://www.doubao.com",
  ark: "https://ark.cn-beijing.volces.com",
  jimeng: "https://jimeng.jianying.com",
  xyq: "https://xyq.jianying.com",
} as const;

/**
 * 默认原线上完整 URL（无自建 API_BASE 时直连）。
 * enrich / chatReply 与 script 同源 completion；自建代理时用可区分扩展路径。
 */
export const ONLINE_ENDPOINTS = {
  script: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.script}`,
  enrich: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.script}`,
  chatReply: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.script}`,
  image: `${UPSTREAM_ORIGINS.ark}${UPSTREAM_PATHS.image}`,
  video: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.video}`,
  videoArk: `${UPSTREAM_ORIGINS.ark}${UPSTREAM_PATHS.videoArk}`,
  authSendCode: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.authSendCode}`,
  authLogin: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.authLogin}`,
  authCheckSession: `${UPSTREAM_ORIGINS.doubao}${UPSTREAM_PATHS.authCheckSession}`,
  mediaBase: UPSTREAM_ORIGINS.doubao,
} as const;

export type UpstreamEndpointKey =
  | "script"
  | "image"
  | "video"
  | "videoArk"
  | "enrich"
  | "chatReply"
  | "authSendCode"
  | "authLogin"
  | "authCheckSession"
  | "mediaBase";

/** 内部调用 path（含旧 /api、旧短路径）→ endpoint 键 */
export const REQUEST_PATH_TO_ENDPOINT: Record<string, UpstreamEndpointKey> = {
  "/api/script": "script",
  "/script": "script",
  [UPSTREAM_PATHS.script]: "script",

  "/api/image": "image",
  "/image": "image",
  [UPSTREAM_PATHS.image]: "image",

  "/api/video": "video",
  "/video": "video",
  [UPSTREAM_PATHS.video]: "video",
  [UPSTREAM_PATHS.videoArk]: "videoArk",

  "/api/enrich": "enrich",
  "/enrich": "enrich",
  [UPSTREAM_PATHS.enrich]: "enrich",

  "/api/chat-reply": "chatReply",
  "/chat-reply": "chatReply",
  [UPSTREAM_PATHS.chatReply]: "chatReply",

  "/api/auth/send-code": "authSendCode",
  "/auth/send-code": "authSendCode",
  [UPSTREAM_PATHS.authSendCode.replace(/\/$/, "")]: "authSendCode",
  [UPSTREAM_PATHS.authSendCode]: "authSendCode",

  "/api/auth/login": "authLogin",
  "/auth/login": "authLogin",
  [UPSTREAM_PATHS.authLogin.replace(/\/$/, "")]: "authLogin",
  [UPSTREAM_PATHS.authLogin]: "authLogin",

  "/api/auth/check-session": "authCheckSession",
  "/auth/check-session": "authCheckSession",
  [UPSTREAM_PATHS.authCheckSession.replace(/\/$/, "")]: "authCheckSession",
  [UPSTREAM_PATHS.authCheckSession]: "authCheckSession",
};

/** 拼到 API_BASE 上的默认原路径 */
export const ENDPOINT_DEFAULT_PATH: Record<
  Exclude<UpstreamEndpointKey, "mediaBase">,
  string
> = {
  script: UPSTREAM_PATHS.script,
  image: UPSTREAM_PATHS.image,
  video: UPSTREAM_PATHS.video,
  videoArk: UPSTREAM_PATHS.videoArk,
  enrich: UPSTREAM_PATHS.enrich,
  chatReply: UPSTREAM_PATHS.chatReply,
  authSendCode: UPSTREAM_PATHS.authSendCode,
  authLogin: UPSTREAM_PATHS.authLogin,
  authCheckSession: UPSTREAM_PATHS.authCheckSession,
};
