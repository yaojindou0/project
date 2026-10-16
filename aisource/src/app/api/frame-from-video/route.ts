import { NextResponse } from "next/server";
import {
  isDoubaoVideoShareUrl,
  resolveDoubaoSharePlayUrl,
} from "@/lib/doubao-share-video";
import { putTmpMedia } from "@/lib/tmp-media";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 80 * 1024 * 1024;

async function downloadVideoToTmp(videoUrl: string, referer?: string) {
  const res = await fetch(videoUrl, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8",
      Referer: referer || videoUrl,
      Origin: "https://www.doubao.com",
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(
      `拉取视频失败 HTTP ${res.status}（链接可能需登录或已过期）`,
    );
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
  if (len > MAX_BYTES) {
    throw new Error("视频过大（超过 80MB），请换较小文件");
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("视频过大（超过 80MB）");
  }
  if (buf.byteLength < 256) {
    throw new Error("拉取结果不像有效视频文件");
  }

  const head = buf.subarray(0, 16);
  const isWebm =
    ctype.includes("webm") ||
    (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf);
  const isFtyp = buf.includes(Buffer.from("ftyp"));
  const looksBinary = !ctype.startsWith("text/") && buf.byteLength > 1024;
  const mime = isWebm
    ? "video/webm"
    : ctype.includes("quicktime") || ctype.includes("mov")
      ? "video/quicktime"
      : "video/mp4";
  if (
    !isWebm &&
    !isFtyp &&
    !ctype.includes("video") &&
    !ctype.includes("octet") &&
    !looksBinary
  ) {
    throw new Error("下载内容不像视频文件，请换可直接播放的 mp4 链接");
  }
  const ext = isWebm ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
  const url = await putTmpMedia(buf, mime, ext);
  return { url, bytes: buf.byteLength, playUrl: videoUrl };
}

/**
 * 把远程视频（含豆包 video-sharing 分享页）拉到同源临时地址，供前端截尾帧。
 * POST { videoUrl } → { url, playUrl? }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { videoUrl?: string };
    const videoUrl = body.videoUrl?.trim();
    if (!videoUrl) {
      return NextResponse.json({ error: "请填写视频链接" }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(videoUrl)) {
      return NextResponse.json(
        { error: "仅支持 http(s) 视频链接；本机/blob 请直接截取" },
        { status: 400 },
      );
    }

    let playUrl = videoUrl;
    let referer = videoUrl;

    // 豆包分享页：先解析出 mp4 直链
    if (isDoubaoVideoShareUrl(videoUrl)) {
      const resolved = await resolveDoubaoSharePlayUrl(videoUrl);
      playUrl = resolved.playUrl;
      referer = videoUrl;
    }

    const result = await downloadVideoToTmp(playUrl, referer);
    return NextResponse.json({
      url: result.url,
      bytes: result.bytes,
      playUrl: result.playUrl,
      fromDoubaoShare: isDoubaoVideoShareUrl(videoUrl),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "拉取视频失败";
    const status = /过大/.test(msg) ? 413 : /失败|不像|不是|解析/.test(msg) ? 502 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
