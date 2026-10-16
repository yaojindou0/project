/** IndexedDB 存放大图/视频，避免 localStorage 5MB 配额爆掉 */

const DB_NAME = "jingxu-media";
const DB_VERSION = 1;
const STORE = "blobs";
export const MEDIA_REF_PREFIX = "jingxu-media:";

type MediaRecord = {
  id: string;
  mime: string;
  /** base64 无 data: 前缀 */
  base64: string;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB 操作失败"));
  });
}

export function isMediaRef(url?: string | null): boolean {
  return Boolean(url?.startsWith(MEDIA_REF_PREFIX));
}

export function isDataUrl(url?: string | null): boolean {
  return Boolean(url?.startsWith("data:"));
}

/** 会过期/不可跨会话的地址：tmp-media、blob */
export function isEphemeralMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  if (url.startsWith("blob:")) return true;
  return /\/(?:api\/)?tmp-media\//i.test(url);
}

/** 可长期携带/展示的地址（data / http(s) / 已落实的 media ref 对应的 data） */
export function isPortableMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  if (isMediaRef(url)) return false;
  if (url.startsWith("blob:")) return false;
  if (isEphemeralMediaUrl(url)) return false;
  if (isDataUrl(url)) {
    return url.length > 64 && /;base64,/i.test(url);
  }
  return /^https?:\/\//i.test(url);
}

function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1] || "application/octet-stream", base64: m[2] };
}

function toDataUrl(mime: string, base64: string) {
  return `data:${mime};base64,${base64}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取媒体失败"));
    reader.readAsDataURL(blob);
  });
}

function tmpMediaFetchCandidates(url: string): string[] {
  const m = url.match(/\/(?:api\/)?tmp-media\/([^/?#]+)/i);
  if (!m) return [url];
  const id = m[1];
  return [...new Set([url, `/api/tmp-media/${id}`, `/tmp-media/${id}`])];
}

async function fetchAsDataUrl(url: string): Promise<string | undefined> {
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

/**
 * 把临时/本地引用落实为可持久化的 data 或 http URL。
 * - jingxu-media: → data
 * - tmp-media / blob → fetch 成 data
 * - http(s) → 尽量内嵌；失败保留原链
 * - 无法落实的临时链 → undefined（避免继续存会裂的地址）
 */
export async function toPersistentMediaUrl(
  url?: string,
): Promise<string | undefined> {
  if (!url) return undefined;
  if (isDataUrl(url)) return isPortableMediaUrl(url) ? url : undefined;

  if (isMediaRef(url)) {
    return (await resolveMediaUrl(url)) || undefined;
  }

  if (isEphemeralMediaUrl(url)) {
    return fetchAsDataUrl(url);
  }

  if (/^https?:\/\//i.test(url)) {
    const embedded = await fetchAsDataUrl(url);
    return embedded || url;
  }

  if (url.startsWith("/")) {
    return fetchAsDataUrl(url);
  }

  return undefined;
}

export async function putDataUrl(dataUrl: string): Promise<string> {
  if (isMediaRef(dataUrl)) return dataUrl;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
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
      } satisfies MediaRecord),
    );
  } finally {
    db.close();
  }
  return `${MEDIA_REF_PREFIX}${id}`;
}

export async function resolveMediaUrl(url?: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  if (!isMediaRef(url)) return url;
  const id = url.slice(MEDIA_REF_PREFIX.length);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const rec = (await idbReq(tx.objectStore(STORE).get(id))) as
      | MediaRecord
      | undefined;
    if (!rec?.base64) return undefined;
    return toDataUrl(rec.mime, rec.base64);
  } finally {
    db.close();
  }
}

export async function deleteMedia(url?: string | null) {
  if (!url || !isMediaRef(url)) return;
  const id = url.slice(MEDIA_REF_PREFIX.length);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

async function mapUrl(
  url: string | undefined,
  fn: (u: string) => Promise<string | undefined>,
): Promise<string | undefined> {
  if (!url) return undefined;
  return fn(url);
}

type ProjectLike = {
  coverUrl?: string;
  characters: {
    referenceImageUrl?: string;
    threeViewUrl?: string;
  }[];
  shots: {
    sceneImageUrl?: string;
    imageUrl?: string;
    lastFrameUrl?: string;
    videoUrl?: string;
  }[];
};

/** 写入 localStorage 前：临时链→data，大 data→IndexedDB 引用 */
export async function dehydrateProjectMedia<T extends ProjectLike>(
  project: T,
): Promise<T> {
  const offload = async (u?: string) => {
    if (!u) return undefined;
    let next = u;
    // 仍指向 tmp-media/blob 的，先拉成 data，否则一重启就裂
    if (isEphemeralMediaUrl(next) || (next.startsWith("/") && !isMediaRef(next))) {
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
      project.characters.map(async (c) => ({
        ...c,
        referenceImageUrl: await mapUrl(c.referenceImageUrl, offload),
        threeViewUrl: await mapUrl(c.threeViewUrl, offload),
      })),
    ),
    shots: await Promise.all(
      project.shots.map(async (s) => ({
        ...s,
        sceneImageUrl: await mapUrl(s.sceneImageUrl, offload),
        imageUrl: await mapUrl(s.imageUrl, offload),
        lastFrameUrl: await mapUrl(s.lastFrameUrl, offload),
        // 视频也可能是 tmp-media；过大时仍走 IndexedDB
        videoUrl: await mapUrl(s.videoUrl, offload),
      })),
    ),
  };
}

/** 读出后：IndexedDB 引用 → data URL；残留 tmp-media 尽量当场修复 */
export async function hydrateProjectMedia<T extends ProjectLike>(
  project: T,
): Promise<T> {
  const load = async (u?: string) => {
    if (!u) return undefined;
    if (isMediaRef(u)) {
      return (await resolveMediaUrl(u)) || undefined;
    }
    if (isEphemeralMediaUrl(u) || (u.startsWith("/") && !/^https?:/i.test(u))) {
      // 临时文件还在则转成 data，方便展示；下次 save 会进 IndexedDB
      return (await toPersistentMediaUrl(u)) || undefined;
    }
    return u;
  };

  return {
    ...project,
    coverUrl: await mapUrl(project.coverUrl, load),
    characters: await Promise.all(
      project.characters.map(async (c) => ({
        ...c,
        referenceImageUrl: await mapUrl(c.referenceImageUrl, load),
        threeViewUrl: await mapUrl(c.threeViewUrl, load),
      })),
    ),
    shots: await Promise.all(
      project.shots.map(async (s) => ({
        ...s,
        sceneImageUrl: await mapUrl(s.sceneImageUrl, load),
        imageUrl: await mapUrl(s.imageUrl, load),
        lastFrameUrl: await mapUrl(s.lastFrameUrl, load),
        videoUrl: await mapUrl(s.videoUrl, load),
      })),
    ),
  };
}

export async function collectMediaRefs(project: ProjectLike): Promise<string[]> {
  const refs: string[] = [];
  const add = (u?: string) => {
    if (u && isMediaRef(u) && !refs.includes(u)) refs.push(u);
  };
  add(project.coverUrl);
  for (const c of project.characters) {
    add(c.referenceImageUrl);
    add(c.threeViewUrl);
  }
  for (const s of project.shots) {
    add(s.sceneImageUrl);
    add(s.imageUrl);
    add(s.lastFrameUrl);
    add(s.videoUrl);
  }
  return refs;
}

function mediaFields(project: ProjectLike): (string | undefined)[] {
  return [
    project.coverUrl,
    ...project.characters.flatMap((c) => [
      c.referenceImageUrl,
      c.threeViewUrl,
    ]),
    ...project.shots.flatMap((s) => [
      s.sceneImageUrl,
      s.imageUrl,
      s.lastFrameUrl,
      s.videoUrl,
    ]),
  ];
}

/** 项目里是否还挂着会过期的临时媒体地址 */
export function projectHasEphemeralMedia(project: ProjectLike): boolean {
  return mediaFields(project).some(
    (u) =>
      !!u &&
      (isEphemeralMediaUrl(u) ||
        (u.startsWith("/") && !isMediaRef(u) && !/^https?:/i.test(u))),
  );
}
