/**
 * 远程视频拉到同源 /tmp-media，供前端截尾帧（对齐 PC /api/frame-from-video）。
 */

import { getTmpMedia, putTmpMedia } from "./tmp-media.mjs";

const MAX_BYTES = 80 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isDoubaoShare(url) {
  return /doubao\.com\/.*video-sharing|doubao\.com\/share/i.test(url);
}

async function resolveSharePlayUrl(shareUrl) {
  const res = await fetch(shareUrl, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const html = await res.text();
  const patterns = [
    /"(?:play_url|video_url|main_url|download_url)"\s*:\s*"(https?:\\\/\\\/[^"]+)"/i,
    /"(?:play_url|video_url|main_url)"\s*:\s*"(https?:\/\/[^"]+)"/i,
    /(https?:\/\/[^\s"'<>]+?\.(?:mp4|webm)[^\s"'<>]*)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const u = m[1]
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&");
    if (/^https?:\/\//i.test(u)) return u;
  }
  throw new Error("无法从豆包分享页解析出可播放地址");
}

async function downloadVideo(videoUrl, referer) {
  const res = await fetch(videoUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8",
      Referer: referer || videoUrl,
      Origin: "https://www.doubao.com",
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`拉取视频失败 HTTP ${res.status}（链接可能需登录或已过期）`);
  }
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (
    ctype.includes("text/html") ||
    ctype.includes("application/json") ||
    ctype.includes("text/plain")
  ) {
    throw new Error("链接返回的不是视频文件（可能是网页或过期直链）");
  }
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("视频过大（超过 80MB），请换较小文件");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("视频过大（超过 80MB）");
  if (buf.byteLength < 256) throw new Error("拉取结果不像有效视频文件");
  const isWebm =
    ctype.includes("webm") ||
    (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf);
  const mime = isWebm ? "video/webm" : "video/mp4";
  const url = await putTmpMedia(buf, mime);
  return { url, bytes: buf.byteLength, playUrl: videoUrl };
}

export async function runFrameFromVideo(body) {
  const videoUrl = String(body?.videoUrl || "").trim();
  if (!videoUrl) {
    const err = new Error("请填写视频链接");
    err.status = 400;
    throw err;
  }

  // 已是本机临时地址：直接回传
  const local = videoUrl.match(/\/(?:api\/)?tmp-media\/([a-zA-Z0-9]+)/);
  if (local) {
    const media = await getTmpMedia(local[1]);
    if (!media) {
      const err = new Error("本地临时视频不存在或已过期");
      err.status = 404;
      throw err;
    }
    return {
      url: `/tmp-media/${local[1]}`,
      bytes: media.bytes.length,
      playUrl: `/tmp-media/${local[1]}`,
    };
  }

  if (!/^https?:\/\//i.test(videoUrl)) {
    const err = new Error("仅支持 http(s) 视频链接；本机/blob 请直接截取");
    err.status = 400;
    throw err;
  }

  let playUrl = videoUrl;
  let referer = videoUrl;
  let fromDoubaoShare = false;
  if (isDoubaoShare(videoUrl)) {
    fromDoubaoShare = true;
    playUrl = await resolveSharePlayUrl(videoUrl);
    referer = videoUrl;
  }

  const result = await downloadVideo(playUrl, referer);
  return {
    url: result.url,
    bytes: result.bytes,
    playUrl: result.playUrl,
    fromDoubaoShare,
  };
}
