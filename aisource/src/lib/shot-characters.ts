import type { CharacterCard, Shot } from "./types";

function normName(s: string) {
  return (s || "").replace(/\s+/g, "").toLowerCase();
}

export function characterKey(c: CharacterCard): string {
  return (c.id || c.name || "").trim();
}

const SKIP_SPEAKERS = new Set([
  "旁白",
  "内心",
  "独白",
  "画外音",
  "系统",
  "字幕",
  "主角",
  "配角",
  "对手",
  "众人",
  "群众",
  "观众",
]);

function findExact(
  byNorm: Map<string, CharacterCard>,
  raw?: string,
): CharacterCard | null {
  const name = (raw || "").trim();
  if (!name || SKIP_SPEAKERS.has(name)) return null;
  return byNorm.get(normName(name)) || null;
}

/**
 * 自动捕捉本镜涉及人物（严格优先）：
 * 1) characterIntros
 * 2) 台词 speaker
 * 3) 场景/分镜中「姓名：」
 * 4) 全文精确包含角色名（仅全名命中，不做模糊子串）
 * 最多 4 人，避免误传群演/族人卡
 */
export function matchShotCharacters(
  shot: Shot,
  characters: CharacterCard[],
): CharacterCard[] {
  if (!characters.length) return [];

  const usable = characters.filter((c) => c.name?.trim());
  const byNorm = new Map(usable.map((c) => [normName(c.name), c] as const));
  const hit = new Map<string, CharacterCard>();
  const add = (raw?: string, force = false) => {
    const c = findExact(byNorm, raw);
    if (!c) return;
    if (hit.size >= 4 && !force && !hit.has(characterKey(c))) return;
    hit.set(characterKey(c), c);
  };

  for (const intro of shot.characterIntros || []) add(intro.name, true);
  for (const line of shot.lines || []) {
    if (line.kind === "aside") continue;
    add(line.speaker, true);
  }

  const hay = [
    shot.scene,
    shot.dialogue,
    shot.storyboardPrompt,
    shot.imagePrompt,
    ...(shot.lines || []).map((l) => l.text),
  ]
    .filter(Boolean)
    .join("\n");

  for (const m of hay.matchAll(/([\u4e00-\u9fff·]{2,6})\s*[：:]/g)) {
    add(m[1]);
  }

  // 全名出现在文本中（按名字长度降序，避免短名误伤）
  if (hit.size < 4) {
    const sorted = [...usable].sort(
      (a, b) => b.name.trim().length - a.name.trim().length,
    );
    for (const c of sorted) {
      if (hit.size >= 4) break;
      const n = c.name.trim();
      if (n.length < 2) continue;
      // 群演/群体名跳过，除非已是说话人
      if (/群体|众人|护卫|族人|士兵|弟子|路人/.test(n)) continue;
      if (hay.includes(n)) add(n);
    }
  }

  return [...hit.values()].slice(0, 4);
}

/** 按勾选键解析角色；未勾选时回退自动识别 */
export function resolveCharactersByKeys(
  characters: CharacterCard[],
  keys: string[] | undefined,
  fallbackShot?: Shot,
): CharacterCard[] {
  if (keys === undefined) {
    return fallbackShot
      ? matchShotCharacters(fallbackShot, characters)
      : [];
  }
  if (!keys.length) return [];
  const set = new Set(keys.map((k) => k.trim()).filter(Boolean));
  return characters.filter((c) => set.has(characterKey(c)));
}

/** 本镜用于视频的角色：勾选优先，否则自动匹配；仅保留有参考图的 */
export function resolveVideoCharacters(
  shot: Shot,
  characters: CharacterCard[],
  selectedKeys?: string[],
): CharacterCard[] {
  const keys =
    selectedKeys !== undefined ? selectedKeys : shot.videoCharacterKeys;
  const picked = resolveCharactersByKeys(characters, keys, shot);
  return picked.filter((c) => c.threeViewUrl || c.referenceImageUrl);
}
