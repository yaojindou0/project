import type { CharacterCard } from "./types";
import { uid } from "./id";
import { isDataUrl, isMediaRef, resolveMediaUrl } from "./media-db";

export const CHARACTER_PACK_KIND = "jingxu-characters";
export const CHARACTER_PACK_VERSION = 1;

export type CharacterPack = {
  version: number;
  kind: typeof CHARACTER_PACK_KIND;
  exportedAt: string;
  title?: string;
  characters: CharacterCard[];
};

async function materializeUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (isDataUrl(url) || /^https?:\/\//i.test(url)) return url;
  if (isMediaRef(url)) return (await resolveMediaUrl(url)) || undefined;
  return url;
}

/** 导出用：把角色图全部落实为可携带的 data/http URL */
export async function buildCharacterPack(
  characters: CharacterCard[],
  title?: string,
): Promise<CharacterPack> {
  const list: CharacterCard[] = [];
  for (const c of characters) {
    list.push({
      id: c.id || uid("char"),
      name: c.name,
      appearance: c.appearance,
      locked: c.locked ?? true,
      threeViewUrl: await materializeUrl(c.threeViewUrl),
      referenceImageUrl: await materializeUrl(c.referenceImageUrl),
    });
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
    return {
      id: uid("char"),
      name,
      appearance: c.appearance || "",
      locked: c.locked ?? true,
      threeViewUrl: c.threeViewUrl,
      referenceImageUrl: c.referenceImageUrl || c.threeViewUrl,
    };
  });
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

export function readCharacterPackFile(file: File): Promise<CharacterCard[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const json = JSON.parse(text) as unknown;
        resolve(parseCharacterPack(json));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("无法解析角色包"));
      }
    };
    reader.onerror = () => reject(new Error("读取角色包失败"));
    reader.readAsText(file);
  });
}
