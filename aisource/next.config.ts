import type { NextConfig } from "next";

/**
 * standalone：打包后自带 Node 服务。
 * jingxu-html 走上游原路径（不用 /api 业务前缀），此处 rewrite 到内部实现。
 */
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  /**
   * 视频请求会带多张 base64 参考图，默认 10MB 中间件缓冲会被截断导致 JSON 解析失败。
   * Next 16：proxyClientMaxBodySize（middleware 文件仍走同一限制）。
   */
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async rewrites() {
    return {
      // 方舟风格 /api/v3/* 必须 beforeFiles，避免被 App Router /api 抢先 404
      beforeFiles: [
        {
          source: "/api/v3/images/generations",
          destination: "/api/image",
        },
        {
          source: "/api/v3/contents/generations/tasks",
          destination: "/api/video",
        },
      ],
      afterFiles: [
        // —— 上游原路径（jingxu-html 主用）——
        { source: "/samantha/chat/completion", destination: "/api/script" },
        { source: "/samantha/chat/enrich", destination: "/api/enrich" },
        { source: "/samantha/chat/reply", destination: "/api/chat-reply" },
        { source: "/chat/completion", destination: "/api/video" },
        {
          source: "/passport/web/send_code",
          destination: "/api/auth/send-code",
        },
        {
          source: "/passport/web/send_code/",
          destination: "/api/auth/send-code",
        },
        {
          source: "/passport/web/sms_login",
          destination: "/api/auth/login",
        },
        {
          source: "/passport/web/sms_login/",
          destination: "/api/auth/login",
        },
        {
          source: "/passport/account/info/v2",
          destination: "/api/auth/check-session",
        },
        {
          source: "/passport/account/info/v2/",
          destination: "/api/auth/check-session",
        },
        { source: "/tmp-media/:id", destination: "/api/tmp-media/:id" },
        { source: "/jimeng/check", destination: "/api/jimeng/check" },

        // —— 旧短路径兼容 ——
        { source: "/script", destination: "/api/script" },
        { source: "/image", destination: "/api/image" },
        { source: "/video", destination: "/api/video" },
        { source: "/enrich", destination: "/api/enrich" },
        { source: "/chat-reply", destination: "/api/chat-reply" },
        { source: "/auth/send-code", destination: "/api/auth/send-code" },
        { source: "/auth/login", destination: "/api/auth/login" },
        {
          source: "/auth/check-session",
          destination: "/api/auth/check-session",
        },
        { source: "/doubao/check", destination: "/api/doubao/check" },
        {
          source: "/frame-from-video",
          destination: "/api/frame-from-video",
        },
      ],
    };
  },
  async headers() {
    const cors = [
      { key: "Access-Control-Allow-Origin", value: "*" },
      {
        key: "Access-Control-Allow-Methods",
        value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      {
        key: "Access-Control-Allow-Headers",
        value: "Content-Type, Authorization, X-Requested-With",
      },
    ];
    return [
      { source: "/api/:path*", headers: cors },
      { source: "/samantha/:path*", headers: cors },
      { source: "/chat/completion", headers: cors },
      { source: "/passport/:path*", headers: cors },
      { source: "/tmp-media/:path*", headers: cors },
      { source: "/jimeng/:path*", headers: cors },
      { source: "/script", headers: cors },
      { source: "/image", headers: cors },
      { source: "/video", headers: cors },
      { source: "/enrich", headers: cors },
      { source: "/chat-reply", headers: cors },
      { source: "/auth/:path*", headers: cors },
    ];
  },
};

export default nextConfig;
