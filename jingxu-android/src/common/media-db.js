/**
 * 媒体持久化（对齐 PC media-db）：
 * - /tmp-media、blob → 拉成 data URL
 * - 大 data URL → IndexedDB（jingxu-media:id），避免 uni storage 配额爆掉
 */

export const MEDIA_REF_PREFIX = "jingxu-media:";

const DB_NAME = "jingxu-android-media";
const DB_VERSION = 1;
const STORE = "blobs";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境无 IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 打开失败"));
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 操作失败"));
  });
}

export function isMediaRef(url) {
  return Boolean(url && String(url).startsWith(MEDIA_REF_PREFIX));
}

export function isDataUrl(url) {
  return Boolean(url && String(url).startsWith("data:"));
}

export function isEphemeralMediaUrl(url) {
  if (!url) return false;
  if (String(url).startsWith("blob:")) return true;
  return /\/(?:api\/)?tmp-media\//i.test(url);
}

export function isPortableMediaUrl(url) {
  if (!url) return false;
  if (isMediaRef(url)) return false;
  if (String(url).startsWith("blob:")) return false;
  if (isEphemeralMediaUrl(url)) return false;
  if (isDataUrl(url)) {
    return url.length > 64 && /;base64,/i.test(url);
  }
  return /^https?:\/\//i.test(url);
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1] || "application/octet-stream", base64: m[2] };
}

function toDataUrl(mime, base64) {
  return `data:${mime};base64,${base64}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取媒体失败"));
    reader.readAsDataURL(blob);
  });
}

function tmpMediaFetchCandidates(url) {
  const m = String(url).match(/\/(?:api\/)?tmp-media\/([^/?#]+)/i);
  if (!m) return [url];
  const id = m[1];
  const list = [url, `/api/tmp-media/${id}`, `/tmp-media/${id}`];
  if (typeof location !== "undefined" && location.origin) {
    list.push(`${location.origin}/tmp-media/${id}`);
    list.push(`${location.origin}/api/tmp-media/${id}`);
  }
  return [...new Set(list)];
}

async function fetchAsDataUrl(url) {
  if (typeof fetch !== "function") return undefined;
  const candidates = /tmp-media/i.test(url)
    ? tmpMediaFetchCandidates(url)
    : [url];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.size) continue;
      const dataUrl = await blobToDataUrl(blob);
      if (isDataUrl(dataUrl)) return dataUrl;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

export async function toPersistentMediaUrl(url) {
  if (!url) return undefined;
  if (isDataUrl(url)) return isPortableMediaUrl(url) ? url : undefined;
  if (isMediaRef(url)) return (await resolveMediaUrl(url)) || undefined;
  if (isEphemeralMediaUrl(url) || (String(url).startsWith("/") && !/^https?:/i.test(url))) {
    return fetchAsDataUrl(url);
  }
  if (/^https?:\/\//i.test(url)) {
    const embedded = await fetchAsDataUrl(url);
    return embedded || url;
  }
  return undefined;
}

export async function putDataUrl(dataUrl) {
  if (isMediaRef(dataUrl)) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  try {
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(
        tx.objectStore(STORE).put({
          id,
          mime: parsed.mime,
          base64: parsed.base64,
          updatedAt: Date.now(),
        }),
      );
    } finally {
      db.close();
    }
    return `${MEDIA_REF_PREFIX}${id}`;
  } catch {
    // App 等无 IDB 环境：保留 data URL（可能触存储上限）
    return dataUrl;
  }
}

async function readMediaRecord(url) {
  if (!isMediaRef(url)) return undefined;
  const id = url.slice(MEDIA_REF_PREFIX.length);
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      return await idbReq(tx.objectStore(STORE).get(id));
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

export function isLikelyVideoUrl(url) {
  if (!url) return false;
  if (/^data:video\//i.test(url)) return true;
  return /\.(mp4|webm|mov)(?:$|\?)/i.test(url) || /\/video/i.test(url);
}

export async function resolveMediaUrl(url) {
  if (!url) return undefined;
  if (!isMediaRef(url)) return url;
  const rec = await readMediaRecord(url);
  if (!rec?.base64) return undefined;
  return toDataUrl(rec.mime, rec.base64);
}

export async function deleteMedia(url) {
  if (!url || !isMediaRef(url)) return;
  const id = url.slice(MEDIA_REF_PREFIX.length);
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      await idbReq(tx.objectStore(STORE).delete(id));
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

async function mapUrl(url, fn) {
  if (!url) return undefined;
  return fn(url);
}

async function mapShotMedia(shot, mapUrlFn) {
  if (!shot) return shot;
  return {
    ...shot,
    sceneImageUrl: await mapUrl(shot.sceneImageUrl, mapUrlFn),
    imageUrl: await mapUrl(shot.imageUrl, mapUrlFn),
    lastFrameUrl: await mapUrl(shot.lastFrameUrl, mapUrlFn),
    videoUrl: await mapUrl(shot.videoUrl, mapUrlFn),
  };
}

async function mapStudioCaches(caches, mapUrlFn) {
  if (!caches || typeof caches !== "object") return caches;
  const next = { ...caches };
  for (const key of ["raw", "board"]) {
    const entry = caches[key];
    if (!entry || typeof entry !== "object") continue;
    next[key] = {
      ...entry,
      shots: await Promise.all(
        (entry.shots || []).map((s) => mapShotMedia(s, mapUrlFn)),
      ),
    };
  }
  return next;
}

/** 写入 storage 前：临时链→data，大 data→IndexedDB 引用 */
export async function dehydrateProjectMedia(project) {
  const offload = async (u) => {
    if (!u) return undefined;
    let next = u;
    if (isEphemeralMediaUrl(next) || (String(next).startsWith("/") && !isMediaRef(next))) {
      const persisted = await toPersistentMediaUrl(next);
      if (!persisted) return undefined;
      next = persisted;
    }
    if (isDataUrl(next) && next.length > 2048) return putDataUrl(next);
    return next;
  };

  return {
    ...project,
    coverUrl: await mapUrl(project.coverUrl, offload),
    characters: await Promise.all(
      (project.characters || []).map(async (c) => ({
        ...c,
        referenceImageUrl: await mapUrl(c.referenceImageUrl, offload),
        threeViewUrl: await mapUrl(c.threeViewUrl, offload),
      })),
    ),
    shots: await Promise.all(
      (project.shots || []).map((s) => mapShotMedia(s, offload)),
    ),
    studioCaches: await mapStudioCaches(project.studioCaches, offload),
  };
}

/** 读出后：图片 ref→data；视频 ref/临时链保持短地址，避免二次出片 OOM */
export async function hydrateProjectMedia(project) {
  const load = async (u) => {
    if (!u) return undefined;
    if (isMediaRef(u)) {
      const rec = await readMediaRecord(u);
      if (rec?.mime?.startsWith("video/")) return u;
      return (await resolveMediaUrl(u)) || undefined;
    }
    if (isEphemeralMediaUrl(u) || (String(u).startsWith("/") && !/^https?:/i.test(u))) {
      if (isLikelyVideoUrl(u) || /\/(?:api\/)?tmp-media\//i.test(u)) return u;
      return (await toPersistentMediaUrl(u)) || undefined;
    }
    return u;
  };

  return {
    ...project,
    coverUrl: await mapUrl(project.coverUrl, load),
    characters: await Promise.all(
      (project.characters || []).map(async (c) => ({
        ...c,
        referenceImageUrl: await mapUrl(c.referenceImageUrl, load),
        threeViewUrl: await mapUrl(c.threeViewUrl, load),
      })),
    ),
    shots: await Promise.all(
      (project.shots || []).map((s) => mapShotMedia(s, load)),
    ),
    studioCaches: await mapStudioCaches(project.studioCaches, load),
  };
}

/** 出片请求体里超过此长度的 data URL 改走 /tmp-media，避免浏览器 OOM 崩溃 */
const REQUEST_DATA_URL_OFFLOAD = 4096;

/**
 * 出片前把大图 / jingxu-media 卸成短链，禁止多张大 base64 塞进 JSON。
 */
export async function offloadMediaForRequest(url) {
  if (!url) return undefined;
  let s = String(url).trim();
  if (!s) return undefined;

  if (isMediaRef(s)) {
    const resolved = await resolveMediaUrl(s);
    if (!resolved) return undefined;
    s = resolved;
  }

  if (isDataUrl(s) && s.length > REQUEST_DATA_URL_OFFLOAD) {
    try {
      const res = await fetch("/api/tmp-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: s }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) return String(data.url);
    } catch {
      /* 回退原链 */
    }
  }

  if (isEphemeralMediaUrl(s) || (s.startsWith("/") && !/^https?:/i.test(s))) {
    return s;
  }
  if (/^https?:\/\//i.test(s)) return s;
  if (isDataUrl(s)) return s;
  return undefined;
}

/** 角色列表单独脱水，供角色库缓存 */
export async function dehydrateCharacters(characters) {
  const project = await dehydrateProjectMedia({
    characters: characters || [],
    shots: [],
  });
  return project.characters;
}

export async function hydrateCharacters(characters) {
  const project = await hydrateProjectMedia({
    characters: characters || [],
    shots: [],
  });
  return project.characters;
}
