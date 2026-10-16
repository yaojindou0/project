import type { CharacterCard } from "./types";
import { uid } from "./id";
import {
  isPortableMediaUrl,
  toPersistentMediaUrl,
} from "./media-db";

export const CHARACTER_PACK_KIND = "jingxu-characters";
export const CHARACTER_PACK_VERSION = 1;

export type CharacterPack = {
  version: number;
  kind: typeof CHARACTER_PACK_KIND;
  exportedAt: string;
  title?: string;
  characters: CharacterCard[];
};

export const isPortableImageUrl = isPortableMediaUrl;

export async function toPortableImageUrl(
  url?: string,
): Promise<string | undefined> {
  return toPersistentMediaUrl(url);
}

async function materializeCharacterImages(
  c: CharacterCard,
): Promise<CharacterCard> {
  const three = await toPersistentMediaUrl(c.threeViewUrl);
  const ref = await toPersistentMediaUrl(c.referenceImageUrl);
  return {
    ...c,
    threeViewUrl: three,
    referenceImageUrl: ref || three,
  };
}

/** 导出用：把角色图全部落实为可携带的 data/http URL */
export async function buildCharacterPack(
  characters: CharacterCard[],
  title?: string,
): Promise<CharacterPack> {
  const list: CharacterCard[] = [];
  for (const c of characters) {
    const portable = await materializeCharacterImages({
      id: c.id || uid("char"),
      name: c.name,
      appearance: c.appearance,
      locked: c.locked ?? true,
      threeViewUrl: c.threeViewUrl,
      referenceImageUrl: c.referenceImageUrl,
    });
    list.push(portable);
  }
  return {
    version: CHARACTER_PACK_VERSION,
    kind: CHARACTER_PACK_KIND,
    exportedAt: new Date().toISOString(),
    title,
    characters: list,
  };
}

export function parseCharacterPack(raw: unknown): CharacterCard[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("角色包格式无效");
  }
  const obj = raw as Partial<CharacterPack> & { characters?: unknown };
  const list = Array.isArray(obj.characters)
    ? obj.characters
    : Array.isArray(raw)
      ? (raw as unknown[])
      : null;
  if (!list?.length) throw new Error("角色包里没有角色");

  return list.map((item) => {
    const c = (item || {}) as Partial<CharacterCard>;
    const name = (c.name || "").trim() || "角色";
    const three = typeof c.threeViewUrl === "string" ? c.threeViewUrl : undefined;
    const ref =
      typeof c.referenceImageUrl === "string" ? c.referenceImageUrl : undefined;
    return {
      id: uid("char"),
      name,
      appearance: c.appearance || "",
      locked: c.locked ?? true,
      threeViewUrl: three,
      referenceImageUrl: ref || three,
    };
  });
}

function characterNameKey(name: string) {
  return name.trim().toLowerCase();
}

function pickImageUrl(
  preferred?: string,
  ...fallbacks: (string | undefined)[]
): string | undefined {
  if (isPortableMediaUrl(preferred)) return preferred;
  for (const u of fallbacks) {
    if (isPortableMediaUrl(u)) return u;
  }
  if (preferred) return preferred;
  for (const u of fallbacks) {
    if (u) return u;
  }
  return undefined;
}

/**
 * 按名称合并角色：
 * - 两边都有 → 用导入内容覆盖（保留本机 id，避免分镜勾选失联）
 * - 仅本机有 → 保留
 * - 仅导入有 → 追加
 */
export function mergeCharactersByName(
  current: CharacterCard[],
  incoming: CharacterCard[],
): { characters: CharacterCard[]; replaced: number; added: number; kept: number } {
  const byName = new Map<string, CharacterCard>();
  for (const c of current) {
    const key = characterNameKey(c.name || "");
    if (!key) continue;
    byName.set(key, c);
  }

  let replaced = 0;
  let added = 0;
  for (const inc of incoming) {
    const key = characterNameKey(inc.name || "");
    if (!key) continue;
    const prev = byName.get(key);
    if (prev) {
      const three = pickImageUrl(
        isPortableMediaUrl(inc.threeViewUrl) ? inc.threeViewUrl : undefined,
        isPortableMediaUrl(inc.referenceImageUrl)
          ? inc.referenceImageUrl
          : undefined,
        prev.threeViewUrl,
        prev.referenceImageUrl,
      );
      const ref = pickImageUrl(
        isPortableMediaUrl(inc.referenceImageUrl)
          ? inc.referenceImageUrl
          : undefined,
        three,
        prev.referenceImageUrl,
        prev.threeViewUrl,
      );
      byName.set(key, {
        ...prev,
        ...inc,
        id: prev.id || inc.id || uid("char"),
        name: inc.name.trim() || prev.name,
        threeViewUrl: three,
        referenceImageUrl: ref,
        locked: inc.locked ?? prev.locked ?? true,
      });
      replaced += 1;
    } else {
      byName.set(key, {
        ...inc,
        id: inc.id || uid("char"),
        name: inc.name.trim() || "角色",
        threeViewUrl: isPortableMediaUrl(inc.threeViewUrl)
          ? inc.threeViewUrl
          : undefined,
        referenceImageUrl: isPortableMediaUrl(inc.referenceImageUrl)
          ? inc.referenceImageUrl
          : isPortableMediaUrl(inc.threeViewUrl)
            ? inc.threeViewUrl
            : undefined,
      });
      added += 1;
    }
  }

  const seen = new Set<string>();
  const out: CharacterCard[] = [];
  for (const c of current) {
    const key = characterNameKey(c.name || "");
    if (!key || seen.has(key)) continue;
    const merged = byName.get(key);
    if (merged) {
      out.push(merged);
      seen.add(key);
    }
  }
  for (const inc of incoming) {
    const key = characterNameKey(inc.name || "");
    if (!key || seen.has(key)) continue;
    const merged = byName.get(key);
    if (merged) {
      out.push(merged);
      seen.add(key);
    }
  }

  const kept = current.filter((c) => {
    const key = characterNameKey(c.name || "");
    return key && !incoming.some((i) => characterNameKey(i.name || "") === key);
  }).length;

  return { characters: out, replaced, added, kept };
}

export function downloadCharacterPack(filename: string, pack: CharacterPack) {
  const blob = new Blob([JSON.stringify(pack)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readCharacterPackFile(
  file: File,
): Promise<CharacterCard[]> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("无法解析角色包");
  }
  const parsed = parseCharacterPack(json);
  const out: CharacterCard[] = [];
  for (const c of parsed) {
    out.push(await materializeCharacterImages(c));
  }
  return out;
}
