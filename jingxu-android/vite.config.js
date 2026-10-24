import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { runScriptUpstream } from "./proxy/script-upstream.mjs";
import { runEnrichUpstream } from "./proxy/enrich-upstream.mjs";
import { runImageUpstream } from "./proxy/image-upstream.mjs";
import { runAuthCheckUpstream } from "./proxy/auth-upstream.mjs";
import { runChatReplyUpstream } from "./proxy/chat-reply-upstream.mjs";
import { runVideoUpstream } from "./proxy/video-upstream.mjs";
import { runFrameFromVideo } from "./proxy/frame-from-video.mjs";
import {
  runAuthLoginUpstream,
  runAuthSendCodeUpstream,
} from "./proxy/auth-sms-upstream.mjs";
import { getTmpMedia, putTmpMedia } from "./proxy/tmp-media.mjs";

const localConfig = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "config.js",
);

function loadEndpoints() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(localConfig, "utf8"), sandbox);
  return sandbox.window.__JINGXU_ENDPOINTS__ || {};
}

/**
 * 按 PC 静态站 config.js 的方式重新代理：
 * 浏览器只打同源路径，开发服务改写到本目录 config.js 的线上地址。
 * 不转发到电脑上的 Next / 3000。
 * 分镜/补全/生图/校验走中间件协议转换，其余仍用 http-proxy。
 */
function proxyExact(targetUrl) {
  const target = new URL(targetUrl);
  return {
    target: target.origin,
    changeOrigin: true,
    secure: true,
    rewrite(p) {
      const q = p.includes("?") ? p.slice(p.indexOf("?")) : "";
      if (!q) return target.pathname + target.search;
      if (target.search) return `${target.pathname}${target.search}&${q.slice(1)}`;
      return target.pathname + q;
    },
    configure(proxyServer) {
      proxyServer.on("proxyReq", (proxyReq, req) => {
        const sid = String(req.headers["x-jingxu-session"] || "").trim();
        const cookie = String(req.headers["x-jingxu-cookie"] || "").trim();
        if (cookie) proxyReq.setHeader("Cookie", cookie);
        else if (sid) {
          proxyReq.setHeader("Cookie", `sessionid=${sid}; sessionid_ss=${sid}`);
        }
        proxyReq.setHeader("Origin", target.origin);
        proxyReq.setHeader("Referer", `${target.origin}/`);
      });
    },
  };
}

function buildProxy() {
  const ep = loadEndpoints();
  // 创作台相关接口均由中间件处理；仅保留方舟视频任务等可选裸转发
  const pairs = [["/api/v3/contents/generations/tasks", ep.videoArk]];
  return Object.fromEntries(
    pairs
      .filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url))
      .map(([key, url]) => [key, proxyExact(url)]),
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(data));
}

function matchAny(pathname, list) {
  return list.includes(pathname);
}

/** 分镜：创作台 JSON → 豆包对话 → config.js script */
function scriptUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, ["/api/script", "/script", "/samantha/chat/completion"])
    ) {
      return next();
    }
    try {
      const ep = loadEndpoints();
      const scriptUrl = String(ep.script || "").trim();
      if (!scriptUrl) return sendJson(res, 502, { error: "config.js 未配置 script" });
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runScriptUpstream(body, scriptUrl);
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, e?.status || 500, {
        error: e instanceof Error ? e.message : "分镜代理失败",
      });
    }
  };
}

/** 补全：创作台 JSON → 豆包对话 → config.js enrich */
function enrichUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, ["/api/enrich", "/enrich", "/samantha/chat/enrich"])
    ) {
      return next();
    }
    try {
      const ep = loadEndpoints();
      const enrichUrl = String(ep.enrich || ep.script || "").trim();
      if (!enrichUrl) return sendJson(res, 502, { error: "config.js 未配置 enrich" });
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runEnrichUpstream(body, enrichUrl);
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, e?.status || 500, {
        error: e instanceof Error ? e.message : "补全代理失败",
      });
    }
  };
}

/** 对话回复：创作台 JSON → 豆包 → { reply } */
function chatReplyUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, [
        "/api/chat-reply",
        "/chat-reply",
        "/samantha/chat/reply",
      ])
    ) {
      return next();
    }
    try {
      const ep = loadEndpoints();
      const chatUrl = String(ep.chatReply || ep.script || "").trim();
      if (!chatUrl) return sendJson(res, 502, { error: "config.js 未配置 chatReply" });
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runChatReplyUpstream(body, chatUrl);
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, e?.status || 500, {
        error: e instanceof Error ? e.message : "对话代理失败",
      });
    }
  };
}

/** 生图：有方舟 Key → ark；否则豆包网页 Seedream（与 PC 一致） */
function imageUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, ["/api/image", "/image", "/api/v3/images/generations"])
    ) {
      return next();
    }
    try {
      const ep = loadEndpoints();
      const imageUrl = String(ep.image || "").trim();
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runImageUpstream(body, imageUrl);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "生图代理失败";
      const status = /频繁|限流|710022/.test(msg) ? 429 : e?.status || 500;
      sendJson(res, status, { error: msg });
    }
  };
}

/** 视频：创作台 JSON → 豆包官网视频协议 → JSON */
function videoUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, ["/api/video", "/video", "/chat/completion"])
    ) {
      return next();
    }
    // /chat/completion 也可能被其它用途占用；仅处理带 prompt+settings 的创作台体
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      if (
        pathname === "/chat/completion" &&
        !(body?.settings && (body?.prompt || body?.message))
      ) {
        return next();
      }
      const data = await runVideoUpstream(body);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "视频代理失败";
      const status = /频繁|限流|710022/.test(msg) ? 429 : e?.status || 500;
      sendJson(res, status, { error: msg });
    }
  };
}

/** 短信发码 / 登录：明确提示改用粘贴 session */
function authSmsUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (req.method !== "POST") return next();
    try {
      if (
        matchAny(pathname, [
          "/api/auth/send-code",
          "/auth/send-code",
          "/passport/web/send_code",
        ])
      ) {
        await readBody(req);
        await runAuthSendCodeUpstream();
        return;
      }
      if (
        matchAny(pathname, [
          "/api/auth/login",
          "/auth/login",
          "/passport/web/sms_login",
        ])
      ) {
        await readBody(req);
        await runAuthLoginUpstream();
        return;
      }
    } catch (e) {
      sendJson(res, e?.status || 500, {
        ok: false,
        error: e instanceof Error ? e.message : "登录代理失败",
      });
      return;
    }
    return next();
  };
}

/** 远程视频 → 同源 /tmp-media（截尾帧） */
function frameFromVideoMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, ["/api/frame-from-video", "/frame-from-video"])
    ) {
      return next();
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runFrameFromVideo(body);
      sendJson(res, 200, data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "拉取视频失败";
      const status = /过大/.test(msg)
        ? 413
        : e?.status || (/失败|不像|不是|解析/.test(msg) ? 502 : 500);
      sendJson(res, status, { error: msg });
    }
  };
}

/** 校验 session：创作台 JSON → config.js authCheckSession */
function authCheckUpstreamMiddleware() {
  return async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    if (
      req.method !== "POST" ||
      !matchAny(pathname, [
        "/api/auth/check-session",
        "/auth/check-session",
        "/api/doubao/check",
        "/doubao/check",
      ])
    ) {
      return next();
    }
    try {
      const ep = loadEndpoints();
      const checkUrl = String(ep.authCheckSession || "").trim();
      if (!checkUrl) {
        return sendJson(res, 502, { error: "config.js 未配置 authCheckSession" });
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString("utf8") || "{}");
      const data = await runAuthCheckUpstream(body, checkUrl);
      sendJson(res, 200, data);
    } catch (e) {
      sendJson(res, e?.status || 500, {
        error: e instanceof Error ? e.message : "校验代理失败",
      });
    }
  };
}

function jingxuConfig() {
  const send = (req, res, next) => {
    const url = (req.url || "").split("?")[0];
    if (url !== "/config.js") return next();
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    fs.createReadStream(localConfig).pipe(res);
  };
  const tmpMedia = () => async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    // 出片前卸大图：POST { dataUrl } → { url: "/tmp-media/..." }
    if (
      req.method === "POST" &&
      (pathname === "/api/tmp-media" || pathname === "/tmp-media")
    ) {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw.toString("utf8") || "{}");
        const dataUrl = String(body.dataUrl || "").trim();
        if (dataUrl.startsWith("data:") && /;base64,/i.test(dataUrl)) {
          const m = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/i);
          if (!m) return sendJson(res, 400, { error: "无效 dataUrl" });
          const mime = m[1] || "image/jpeg";
          const bytes = Buffer.from(m[2], "base64");
          if (bytes.length < 32) return sendJson(res, 400, { error: "图片过小" });
          const url = await putTmpMedia(bytes, mime);
          return sendJson(res, 200, { url });
        }
        const b64 = String(body.base64 || "").trim();
        if (b64) {
          const mime =
            String(body.mime || "image/jpeg").split(";")[0] || "image/jpeg";
          const bytes = Buffer.from(b64, "base64");
          if (bytes.length < 32) return sendJson(res, 400, { error: "图片过小" });
          const url = await putTmpMedia(bytes, mime);
          return sendJson(res, 200, { url });
        }
        return sendJson(res, 400, { error: "缺少 dataUrl 或 base64" });
      } catch (e) {
        return sendJson(res, 500, {
          error: e instanceof Error ? e.message : "上传临时媒体失败",
        });
      }
    }
    const m = pathname.match(/^\/(?:api\/)?tmp-media\/([a-zA-Z0-9]+)$/);
    if (!m || req.method !== "GET") return next();
    try {
      const media = await getTmpMedia(m[1]);
      if (!media) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", media.mime);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.end(media.bytes);
    } catch (e) {
      res.statusCode = 500;
      res.end(e instanceof Error ? e.message : "media error");
    }
  };
  const useAll = (server) => {
    server.middlewares.use(tmpMedia());
    server.middlewares.use(scriptUpstreamMiddleware());
    server.middlewares.use(enrichUpstreamMiddleware());
    server.middlewares.use(chatReplyUpstreamMiddleware());
    server.middlewares.use(imageUpstreamMiddleware());
    server.middlewares.use(videoUpstreamMiddleware());
    server.middlewares.use(frameFromVideoMiddleware());
    server.middlewares.use(authSmsUpstreamMiddleware());
    server.middlewares.use(authCheckUpstreamMiddleware());
    server.middlewares.use(send);
  };
  return {
    name: "jingxu-config",
    configureServer(server) {
      useAll(server);
    },
    configurePreviewServer(server) {
      useAll(server);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "config.js",
        source: fs.readFileSync(localConfig),
      });
    },
  };
}

const proxy = buildProxy();

export default defineConfig({
  plugins: [jingxuConfig(), uni()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    cors: true,
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    cors: true,
    proxy,
  },
});
