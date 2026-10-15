import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, unlink, readdir } from "fs/promises";
import path from "path";
import os from "os";

const ROOT = path.join(os.tmpdir(), "jingxu-tmp-media");
const TTL_MS = 6 * 60 * 60 * 1000;

type Meta = { file: string; mime: string; createdAt: number };

const index = new Map<string, Meta>();

async function ensureRoot() {
  await mkdir(ROOT, { recursive: true });
}

function extFromMime(mime: string, fallback = "bin") {
  const m = (mime || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4")) return "mp4";
  return fallback;
}

/** 把二进制写入临时目录，返回可给前端访问的 /api/tmp-media/id（勿再塞 data URL 进 JSON） */
export async function putTmpMedia(
  bytes: Buffer,
  mime: string,
  ext?: string,
): Promise<string> {
  await ensureRoot();
  const id = randomUUID().replace(/-/g, "");
  const useExt = (ext || extFromMime(mime)).replace(/[^a-z0-9]/gi, "") || "bin";
  const file = path.join(ROOT, `${id}.${useExt}`);
  await writeFile(file, bytes);
  index.set(id, { file, mime, createdAt: Date.now() });
  return `/tmp-media/${id}`;
}

/** data URL → 临时路径，避免 API JSON 塞超大 base64 */
export async function putDataUrlAsTmpMedia(dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return dataUrl;
  const mime = m[1] || "application/octet-stream";
  const buf = Buffer.from(m[2], "base64");
  return putTmpMedia(buf, mime, extFromMime(mime));
}

export async function getTmpMedia(
  id: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const safe = id.replace(/[^a-zA-Z0-9]/g, "");
  if (!safe) return null;
  let meta = index.get(safe);
  if (!meta) {
    try {
      await ensureRoot();
      const files = await readdir(ROOT);
      const hit = files.find((f) => f.startsWith(`${safe}.`));
      if (!hit) return null;
      const file = path.join(ROOT, hit);
      const bytes = await readFile(file);
      const ext = path.extname(hit).slice(1).toLowerCase();
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : ext === "webm"
                  ? "video/webm"
                  : "video/mp4";
      return { bytes, mime };
    } catch {
      return null;
    }
  }
  if (Date.now() - meta.createdAt > TTL_MS) {
    index.delete(safe);
    void unlink(meta.file).catch(() => undefined);
    return null;
  }
  try {
    const bytes = await readFile(meta.file);
    return { bytes, mime: meta.mime };
  } catch {
    index.delete(safe);
    return null;
  }
}
