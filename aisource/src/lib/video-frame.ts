/**
 * 浏览器内从视频截取尾帧（JPEG data URL）。
 * 末尾精确 seek 在多数编码下会黑屏/卡住，故在 seekable 末段多点试探。
 */

function waitEvent(
  target: EventTarget,
  type: string,
  timeoutMs: number,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`等待 ${type} 超时`));
    }, timeoutMs);
    const onOk = (ev: Event) => {
      cleanup();
      resolve(ev);
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`视频事件失败: ${type}`));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(type, onOk);
      target.removeEventListener("error", onErr);
    };
    target.addEventListener(type, onOk);
    target.addEventListener("error", onErr);
  });
}

function waitSeeked(video: HTMLVideoElement, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      window.clearTimeout(timer);
      resolve();
    };
    const onSeeked = () => finish();
    const onErr = () => finish();
    const timer = window.setTimeout(finish, timeoutMs);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onErr);
  });
}

async function waitVideoFrame(video: HTMLVideoElement): Promise<void> {
  const anyVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (
      cb: (now: number, meta: unknown) => void,
    ) => number;
  };
  if (typeof anyVideo.requestVideoFrameCallback === "function") {
    await new Promise<void>((resolve) => {
      const id = anyVideo.requestVideoFrameCallback!(() => resolve());
      window.setTimeout(() => {
        try {
          (
            anyVideo as {
              cancelVideoFrameCallback?: (id: number) => void;
            }
          ).cancelVideoFrameCallback?.(id);
        } catch {
          /* ignore */
        }
        resolve();
      }, 800);
    });
    return;
  }
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
}

function isMostlyBlack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): boolean {
  const sw = Math.min(w, 48);
  const sh = Math.min(h, 48);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += data[i] + data[i + 1] + data[i + 2];
    n += 1;
  }
  if (!n) return true;
  return sum / n / 3 < 12;
}

function captureCanvas(
  video: HTMLVideoElement,
  opts?: { format?: "image/jpeg" | "image/png"; quality?: number },
): { dataUrl: string; black: boolean } | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  let dataUrl = "";
  try {
    dataUrl = canvas.toDataURL(opts?.format || "image/jpeg", opts?.quality ?? 0.92);
  } catch {
    return null;
  }
  if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) return null;
  return { dataUrl, black: isMostlyBlack(ctx, w, h) };
}

function seekTargets(duration: number, seekableEnd: number): number[] {
  const end = Math.max(
    0,
    Number.isFinite(seekableEnd) && seekableEnd > 0 ? seekableEnd : duration,
  );
  if (!Number.isFinite(end) || end <= 0) return [0];
  const offsets = [0.12, 0.25, 0.5, 1, 1.5, 2, 3];
  const points = new Set<number>();
  for (const o of offsets) {
    points.add(Math.max(0, end - o));
  }
  points.add(Math.max(0, end * 0.98));
  points.add(Math.max(0, end * 0.95));
  points.add(Math.max(0, end * 0.9));
  // 极短视频：中间偏后
  if (end < 1) points.add(Math.max(0, end * 0.8));
  return [...points].sort((a, b) => b - a);
}

export async function extractLastFrameFromVideo(
  videoUrl: string,
  opts?: { format?: "image/jpeg" | "image/png"; quality?: number },
): Promise<string> {
  const src = videoUrl.trim();
  if (!src) throw new Error("请填写视频链接");

  const video = document.createElement("video");
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  // 相对路径 / 同源 / blob / data 不要强加 crossOrigin，否则反而加载失败
  const absoluteHttp = /^https?:\/\//i.test(src);
  const sameOrigin =
    absoluteHttp &&
    typeof window !== "undefined" &&
    src.startsWith(window.location.origin);
  if (absoluteHttp && !sameOrigin) {
    video.crossOrigin = "anonymous";
  }

  try {
    video.src = src;
    video.load();

    // 等元数据；部分流式视频 duration 稍后才有限
    await Promise.race([
      waitEvent(video, "loadedmetadata", 20_000),
      waitEvent(video, "loadeddata", 20_000),
    ]).catch(() => {
      throw new Error("视频加载失败（链接无效、需登录或格式不支持）");
    });

    // 再等一帧可绘
    if (video.readyState < 2) {
      await waitEvent(video, "loadeddata", 15_000).catch(() => undefined);
    }

    let duration = video.duration;
    if (!Number.isFinite(duration) || duration === Infinity || duration <= 0) {
      // 试播一下逼出时长
      try {
        await video.play();
        video.pause();
        await new Promise((r) => setTimeout(r, 200));
      } catch {
        /* ignore autoplay block */
      }
      duration = video.duration;
    }

    let seekableEnd = duration;
    try {
      if (video.seekable.length > 0) {
        seekableEnd = video.seekable.end(video.seekable.length - 1);
      }
    } catch {
      /* ignore */
    }

    if (
      (!Number.isFinite(duration) || duration <= 0) &&
      (!Number.isFinite(seekableEnd) || seekableEnd <= 0)
    ) {
      throw new Error("无法读取视频时长，请换可直接播放的 mp4 链接");
    }

    const targets = seekTargets(
      Number.isFinite(duration) && duration > 0 ? duration : seekableEnd,
      seekableEnd,
    );

    let fallback: string | null = null;
    for (const t of targets) {
      const before = video.currentTime;
      try {
        // 与当前几乎相同则跳过，避免不触发 seeked
        if (Math.abs(before - t) < 0.02 && video.readyState >= 2) {
          await waitVideoFrame(video);
        } else {
          video.currentTime = t;
          await waitSeeked(video, 5000);
          await waitVideoFrame(video);
        }
      } catch {
        continue;
      }

      const shot = captureCanvas(video, opts);
      if (!shot) continue;
      if (!shot.black) return shot.dataUrl;
      // 黑帧先留下，继续往更早时刻试
      if (!fallback) fallback = shot.dataUrl;
    }

    if (fallback) return fallback;

    // 最后兜底：当前帧
    const last = captureCanvas(video, opts);
    if (last?.dataUrl) return last.dataUrl;

    throw new Error("截取尾帧失败（无可用画面，请换链接或本镜已生成视频）");
  } finally {
    video.removeAttribute("src");
    try {
      video.load();
    } catch {
      /* ignore */
    }
  }
}

export function isProbablyVideoUrl(url: string) {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("blob:") || u.startsWith("data:video")) return true;
  if (/\/(?:api\/)?tmp-media\//i.test(u)) return true;
  // 豆包分享页（非直链 mp4，由服务端解析）
  if (/doubao\.com\/.*video-sharing/i.test(u)) return true;
  if (
    /doubao\.com/i.test(u) &&
    (/[?&]video_id=/i.test(u) || /[?&]share_id=/i.test(u))
  ) {
    return true;
  }
  return /^https?:\/\//i.test(u);
}

/** 相对媒体路径补成当前页可播放地址 */
export function resolvePlayableVideoUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/^(https?:|blob:|data:)/i.test(u)) return u;
  if (typeof window === "undefined") return u;
  if (u.startsWith("/")) return `${window.location.origin}${u}`;
  return u;
}
