import { NextResponse } from "next/server";
import { putTmpMedia } from "@/lib/tmp-media";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 80 * 1024 * 1024;

/**
 * 把远程视频拉到同源临时地址，供前端 canvas 截取尾帧（绕过跨域）。
 * POST { videoUrl } → { url: "/api/tmp-media/..." }
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

    const res = await fetch(videoUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8",
        Referer: videoUrl,
      },
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `拉取视频失败 HTTP ${res.status}（链接可能需登录或已过期）`,
        },
        { status: 502 },
      );
    }

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (
      ctype.includes("text/html") ||
      ctype.includes("application/json") ||
      ctype.includes("text/plain")
    ) {
      return NextResponse.json(
        { error: "链接返回的不是视频文件（可能是网页或过期直链）" },
        { status: 502 },
      );
    }

    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) {
      return NextResponse.json(
        { error: "视频过大（超过 80MB），请换较小文件或本地下载后再用" },
        { status: 413 },
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "视频过大（超过 80MB）" },
        { status: 413 },
      );
    }
    if (buf.byteLength < 256) {
      return NextResponse.json(
        { error: "拉取结果不像有效视频文件" },
        { status: 502 },
      );
    }

    // 嗅探文件头；CDN 常给 octet-stream，放宽校验
    const head = buf.subarray(0, 16);
    const isWebm =
      ctype.includes("webm") ||
      (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf);
    const isFtyp = buf.includes(Buffer.from("ftyp"), 0);
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
      return NextResponse.json(
        { error: "下载内容不像视频文件，请换可直接播放的 mp4 链接" },
        { status: 502 },
      );
    }
    const ext = isWebm ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";

    const url = await putTmpMedia(buf, mime, ext);
    return NextResponse.json({ url, bytes: buf.byteLength });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "拉取视频失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
