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

function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return null;
  return { mime: m[1] || "application/octet-stream", base64: m[2] };
}

function toDataUrl(mime: string, base64: string) {
  return `data:${mime};base64,${base64}`;
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

/** 写入 localStorage 前：data URL → IndexedDB 引用 */
export async function dehydrateProjectMedia<T extends ProjectLike>(
  project: T,
): Promise<T> {
  const offload = async (u?: string) => {
    if (!u) return undefined;
    if (isDataUrl(u) && u.length > 2048) return putDataUrl(u);
    return u;
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
        videoUrl: await mapUrl(s.videoUrl, offload),
      })),
    ),
  };
}

/** 读出后：IndexedDB 引用 → data URL（供展示与再提交） */
export async function hydrateProjectMedia<T extends ProjectLike>(
  project: T,
): Promise<T> {
  const load = async (u?: string) => {
    if (!u) return undefined;
    if (isMediaRef(u)) return (await resolveMediaUrl(u)) || u;
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
