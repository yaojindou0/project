/**
 * 解析豆包视频分享页 → 可下载的 mp4 直链。
 * 例：https://www.doubao.com/video-sharing?share_id=…&video_id=…
 */

export type DoubaoShareIds = {
  shareId: string;
  videoId: string;
  creationId?: string;
};

export function parseDoubaoVideoShareUrl(
  input: string,
): DoubaoShareIds | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "doubao.com" && !host.endsWith(".doubao.com")) return null;
    if (!/video-sharing/i.test(u.pathname)) return null;
    const shareId = (u.searchParams.get("share_id") || "").trim();
    const videoId = (
      u.searchParams.get("video_id") ||
      u.searchParams.get("vid") ||
      ""
    ).trim();
    const creationId = (u.searchParams.get("creation_id") || "").trim();
    if (!shareId || !videoId) return null;
    return { shareId, videoId, creationId: creationId || undefined };
  } catch {
    return null;
  }
}

export function isDoubaoVideoShareUrl(input: string) {
  return Boolean(parseDoubaoVideoShareUrl(input));
}

/** 调用豆包公开分享接口，拿到 play_info.main / backup */
export async function resolveDoubaoSharePlayUrl(
  input: string,
): Promise<{ playUrl: string; posterUrl?: string; width?: number; height?: number }> {
  const ids = parseDoubaoVideoShareUrl(input);
  if (!ids) {
    throw new Error("不是有效的豆包视频分享链接（需含 share_id 与 video_id）");
  }

  const referer = `https://www.doubao.com/video-sharing?source_type=mobile&share_id=${encodeURIComponent(ids.shareId)}&video_id=${encodeURIComponent(ids.videoId)}`;

  const res = await fetch(
    "https://www.doubao.com/creativity/share/get_video_share_info",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        Referer: referer,
        Origin: "https://www.doubao.com",
      },
      body: JSON.stringify({
        share_id: ids.shareId,
        vid: ids.videoId,
        ...(ids.creationId ? { creation_id: ids.creationId } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const text = await res.text();
  let json: {
    code?: number;
    msg?: string;
    data?: {
      play_info?: {
        main?: string;
        backup?: string;
        poster_url?: string;
        width?: number;
        height?: number;
      };
    };
  } = {};
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`豆包分享接口返回非 JSON（HTTP ${res.status}）`);
  }

  if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
    throw new Error(
      json.msg ||
        `解析豆包分享失败（code ${json.code ?? res.status}），链接可能已失效`,
    );
  }

  const play =
    json.data?.play_info?.main?.trim() ||
    json.data?.play_info?.backup?.trim() ||
    "";
  if (!/^https?:\/\//i.test(play)) {
    throw new Error("豆包分享未返回可播放地址");
  }

  return {
    playUrl: play,
    posterUrl: json.data?.play_info?.poster_url,
    width: json.data?.play_info?.width,
    height: json.data?.play_info?.height,
  };
}
