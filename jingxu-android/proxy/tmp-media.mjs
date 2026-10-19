/**
 * 生图结果落盘，返回同源 /tmp-media/:id，避免 data URL 撑爆 JSON、远程链防盗链空白。
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ROOT = path.join(os.tmpdir(), "jingxu-android-tmp-media");

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "bin";
}

function mimeFromExt(ext) {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

export async function putTmpMedia(bytes, mime) {
  await mkdir(ROOT, { recursive: true });
  const id = randomUUID().replace(/-/g, "");
  const ext = extFromMime(mime);
  const file = path.join(ROOT, `${id}.${ext}`);
  await writeFile(file, bytes);
  return `/tmp-media/${id}`;
}

export async function getTmpMedia(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  if (!safe) return null;
  await mkdir(ROOT, { recursive: true });
  const files = await readdir(ROOT);
  const hit = files.find((f) => f.startsWith(`${safe}.`));
  if (!hit) return null;
  const ext = path.extname(hit).slice(1).toLowerCase();
  const bytes = await readFile(path.join(ROOT, hit));
  return { bytes, mime: mimeFromExt(ext) };
}
