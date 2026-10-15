import type {
  CharacterIntro,
  DialogueLine,
  DialogueLineKind,
  Shot,
} from "./types";
import { uid } from "./id";
import { ensureRenderStyle } from "./render-style";

const KIND_LABEL: Record<DialogueLineKind, string> = {
  dialogue: "对白",
  monologue: "独白",
  aside: "旁白",
  inner: "内心",
};

export function kindLabel(kind: DialogueLineKind) {
  return KIND_LABEL[kind] || kind;
}

export function createEmptyLine(
  kind: DialogueLineKind = "dialogue",
): DialogueLine {
  return { id: uid("line"), kind, speaker: "", text: "" };
}

/** 把多行台词压成旧字段 dialogue，便于兼容导出 */
export function flattenDialogue(lines?: DialogueLine[]): string {
  if (!lines?.length) return "";
  return lines
    .filter((l) => l.text?.trim())
    .map((l) => {
      const tag = kindLabel(l.kind);
      if (l.kind === "aside") return `【${tag}】${l.text.trim()}`;
      if (l.kind === "inner") {
        return l.speaker
          ? `${l.speaker}（内心）${l.text.trim()}`
          : `【内心】${l.text.trim()}`;
      }
      if (l.kind === "monologue") {
        return l.speaker
          ? `${l.speaker}（独白）${l.text.trim()}`
          : `【独白】${l.text.trim()}`;
      }
      return l.speaker
        ? `${l.speaker}：${l.text.trim()}`
        : l.text.trim();
    })
    .join(" / ");
}

/** 从模型或旧数据规范台词行 */
export function normalizeLines(
  raw: unknown,
  fallbackDialogue?: string,
): DialogueLine[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((item) => {
      const o = (item || {}) as Partial<DialogueLine> & {
        type?: string;
        content?: string;
      };
      const kindRaw = String(o.kind || o.type || "dialogue").toLowerCase();
      let kind: DialogueLineKind = "dialogue";
      if (/独白|monologue/.test(kindRaw)) kind = "monologue";
      else if (/旁白|aside|narrat/.test(kindRaw)) kind = "aside";
      else if (/内心|inner|thought/.test(kindRaw)) kind = "inner";
      else kind = "dialogue";
      return {
        id: o.id || uid("line"),
        kind,
        speaker: o.speaker || "",
        text: (o.text || o.content || "").trim(),
      };
    });
  }
  if (fallbackDialogue?.trim()) {
    return [
      {
        id: uid("line"),
        kind: "dialogue",
        speaker: "",
        text: fallbackDialogue.trim(),
      },
    ];
  }
  return [];
}

export function normalizeCharacterIntros(raw: unknown): CharacterIntro[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = (item || {}) as Partial<CharacterIntro>;
      const name = (o.name || "").trim();
      const intro = (o.intro || "").trim();
      if (!name && !intro) return null;
      return { name: name || "角色", intro };
    })
    .filter(Boolean) as CharacterIntro[];
}

/**
 * 组装给 Seedance 的完整分镜叙述：地点介绍 + 人物首次介绍 + 多台词 + 原分镜词
 * 末尾强制附带 CG 国漫默认画面风格与画幅
 */
export function composeVideoPrompt(
  shot: Shot,
  stylePreset?: string,
  aspectRatio?: string,
): string {
  const parts: string[] = [];

  if (aspectRatio?.trim()) {
    parts.push(`画幅：${aspectRatio.trim()}`);
  }
  if (shot.locationName?.trim()) {
    parts.push(`地点：${shot.locationName.trim()}`);
  }
  if (shot.placeIntro?.trim()) {
    parts.push(`地名首次介绍：${shot.placeIntro.trim()}`);
  }
  if (shot.characterIntros?.length) {
    const intros = shot.characterIntros
      .filter((c) => c.name || c.intro)
      .map((c) =>
        c.intro?.trim()
          ? `${c.name}（首次登场：${c.intro.trim()}）`
          : `${c.name}首次登场`,
      )
      .join("；");
    if (intros) parts.push(`人物介绍：${intros}`);
  }

  const lines = shot.lines?.length
    ? shot.lines
    : normalizeLines(undefined, shot.dialogue);
  if (lines.length) {
    const speech = lines
      .filter((l) => l.text?.trim())
      .map((l) => {
        if (l.kind === "aside") return `旁白：${l.text.trim()}`;
        if (l.kind === "inner")
          return `${l.speaker || "角色"}内心独白：${l.text.trim()}`;
        if (l.kind === "monologue")
          return `${l.speaker || "角色"}独白：${l.text.trim()}`;
        return `${l.speaker || "角色"}说：${l.text.trim()}`;
      })
      .join("。");
    if (speech) parts.push(`对白节奏：${speech}`);
  }

  if (shot.storyboardPrompt?.trim()) {
    parts.push(shot.storyboardPrompt.trim());
  } else {
    parts.push(
      [shot.scene, shot.camera, flattenDialogue(lines)]
        .filter(Boolean)
        .join("。"),
    );
  }

  return ensureRenderStyle(parts.join("\n"), stylePreset);
}

function normKey(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 全剧后处理：地名介绍 / 人物介绍仅保留第一次出现的那一镜
 */
export function enforceFirstAppearances(shots: Shot[]): Shot[] {
  const seenPlaces = new Set<string>();
  const seenChars = new Set<string>();

  return shots.map((shot) => {
    const loc = (shot.locationName || "").trim();
    const locKey = loc ? normKey(loc) : shot.placeIntro?.trim()
      ? normKey(shot.placeIntro.slice(0, 24))
      : "";

    let placeIntro = (shot.placeIntro || "").trim();
    if (placeIntro) {
      if (!locKey || seenPlaces.has(locKey)) {
        placeIntro = "";
      } else {
        seenPlaces.add(locKey);
      }
    } else if (locKey) {
      seenPlaces.add(locKey);
    }

    const intros = (shot.characterIntros || [])
      .map((c) => ({
        name: (c.name || "").trim(),
        intro: (c.intro || "").trim(),
      }))
      .filter((c) => c.name || c.intro)
      .filter((c) => {
        const key = normKey(c.name || c.intro.slice(0, 12));
        if (!key || seenChars.has(key)) return false;
        seenChars.add(key);
        return true;
      });

    // 确保至少有 lines 结构（从 dialogue 回填）
    const lines =
      shot.lines?.length
        ? shot.lines
        : normalizeLines(undefined, shot.dialogue);

    return {
      ...shot,
      placeIntro,
      characterIntros: intros,
      lines,
      dialogue: flattenDialogue(lines) || shot.dialogue || "",
    };
  });
}

/** 把叙事要素写回分镜词正文（便于用户直接编辑一整段） */
export function buildMergedStoryboard(shot: Shot): string {
  const blocks: string[] = [];
  if (shot.locationName?.trim() || shot.placeIntro?.trim()) {
    blocks.push(
      [
        shot.locationName?.trim() && `【地点】${shot.locationName.trim()}`,
        shot.placeIntro?.trim() && `【地名介绍】${shot.placeIntro.trim()}`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (shot.characterIntros?.length) {
    const t = shot.characterIntros
      .filter((c) => c.name || c.intro)
      .map((c) =>
        c.intro?.trim()
          ? `【人物】${c.name}：${c.intro.trim()}`
          : `【人物】${c.name}`,
      )
      .join("；");
    if (t) blocks.push(t);
  }
  const lines = shot.lines?.length
    ? shot.lines
    : normalizeLines(undefined, shot.dialogue);
  if (lines.some((l) => l.text?.trim())) {
    blocks.push(
      `【台词】${lines
        .filter((l) => l.text?.trim())
        .map((l) => {
          if (l.kind === "aside") return `旁白「${l.text.trim()}」`;
          if (l.kind === "inner")
            return `${l.speaker || ""}内心「${l.text.trim()}」`;
          if (l.kind === "monologue")
            return `${l.speaker || ""}独白「${l.text.trim()}」`;
          return `${l.speaker || ""}「${l.text.trim()}」`;
        })
        .join(" ")}`,
    );
  }
  const core = shot.storyboardPrompt
    ?.replace(/【地点】[\s\S]*?(?=【|$)/g, "")
    .replace(/【地名介绍】[\s\S]*?(?=【|$)/g, "")
    .replace(/【人物】[\s\S]*?(?=【|$)/g, "")
    .replace(/【台词】[\s\S]*?(?=【|$)/g, "")
    .trim();
  if (core) blocks.push(core);
  else if (shot.scene || shot.camera) {
    blocks.push(
      [shot.scene, shot.camera && `运镜：${shot.camera}`]
        .filter(Boolean)
        .join("。"),
    );
  }
  return blocks.filter(Boolean).join("\n");
}
