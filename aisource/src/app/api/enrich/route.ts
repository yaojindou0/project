import { NextResponse } from "next/server";
import { shouldUseMock } from "@/lib/ai";
import { callChatJson, hasDoubaoAuth } from "@/lib/doubao-content";
import {
  buildCharacterPromptEnrichUser,
  buildScenePromptEnrichUser,
  characterPromptEnrichSystem,
  scenePromptEnrichSystem,
} from "@/lib/prompts";
import type { ApiSettings, CharacterCard, Shot } from "@/lib/types";
import { uid } from "@/lib/id";

export const runtime = "nodejs";
export const maxDuration = 180;

interface EnrichBody {
  mode: "characters" | "scenes";
  premise: string;
  style: string;
  aspectRatio?: string;
  settings: ApiSettings;
  characters?: CharacterCard[];
  shots?: (Pick<
    Shot,
    | "index"
    | "scene"
    | "locationName"
    | "placeIntro"
    | "storyboardPrompt"
    | "dialogue"
  > & {
    lines?: { speaker?: string; text?: string }[];
    characterIntros?: { name?: string; intro?: string }[];
  })[];
}

function extractNamesHeuristic(
  premise: string,
  shots: EnrichBody["shots"],
  existing: CharacterCard[],
): CharacterCard[] {
  const skip = new Set([
    "旁白",
    "内心",
    "独白",
    "画外音",
    "系统",
    "字幕",
    "主角",
    "配角",
    "对手",
  ]);
  const names = new Set<string>();
  for (const c of existing) {
    if (c.name?.trim()) names.add(c.name.trim());
  }
  for (const s of shots || []) {
    for (const line of s.lines || []) {
      const sp = line.speaker?.trim();
      if (sp && !skip.has(sp)) names.add(sp);
    }
    for (const intro of s.characterIntros || []) {
      const n = intro.name?.trim();
      if (n && !skip.has(n)) names.add(n);
    }
    for (const m of `${s.dialogue || ""}\n${s.storyboardPrompt || ""}`.matchAll(
      /([\u4e00-\u9fff·]{2,4})[：:]/g,
    )) {
      if (!skip.has(m[1])) names.add(m[1]);
    }
  }
  for (const m of premise.matchAll(
    /(?:名叫|名为|角色|主角|配角)[「『]?([\u4e00-\u9fff·A-Za-z]{2,8})/g,
  )) {
    if (!skip.has(m[1])) names.add(m[1]);
  }
  if (!names.size) {
    names.add("男主");
    names.add("女主");
  }
  return [...names].map((name) => {
    const prev = existing.find((c) => c.name === name);
    return {
      id: prev?.id || uid("char"),
      name,
      appearance:
        prev?.appearance?.trim() ||
        `${name}，CG国漫电影级人物，五官清晰，服装细节完整，气质符合「${premise.slice(0, 24)}」`,
      locked: prev?.locked ?? true,
      threeViewUrl: prev?.threeViewUrl,
      referenceImageUrl: prev?.referenceImageUrl,
    };
  });
}

function mergeExtractedCharacters(
  existing: CharacterCard[],
  extracted: { name: string; appearance?: string; locked?: boolean }[],
): CharacterCard[] {
  const byName = new Map(existing.map((c) => [c.name.trim(), c]));
  const out: CharacterCard[] = [];
  const seen = new Set<string>();

  for (const item of extracted) {
    const name = (item.name || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const prev = byName.get(name);
    out.push({
      id: prev?.id || uid("char"),
      name,
      appearance: (item.appearance || prev?.appearance || "").trim(),
      locked: item.locked ?? prev?.locked ?? true,
      threeViewUrl: prev?.threeViewUrl,
      referenceImageUrl: prev?.referenceImageUrl,
    });
  }

  // 保留未出现在提取结果但已有图的旧卡，避免误删
  for (const c of existing) {
    const n = c.name.trim();
    if (seen.has(n)) continue;
    if (c.threeViewUrl || c.referenceImageUrl) {
      out.push(c);
      seen.add(n);
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EnrichBody;
    if (!body.mode || !body.premise?.trim()) {
      return NextResponse.json(
        { error: "缺少 mode 或故事内容" },
        { status: 400 },
      );
    }

    if (shouldUseMock(body.settings) || !hasDoubaoAuth(body.settings)) {
      if (body.mode === "characters") {
        const characters = extractNamesHeuristic(
          body.premise,
          body.shots,
          body.characters || [],
        );
        return NextResponse.json({
          mode: "mock",
          characters,
          hint: "未登录豆包，已本地提取人物并生成模板外貌；登录后可获更完整角色卡",
        });
      }
      const shots = (body.shots || []).map((s) => ({
        index: s.index,
        scene: s.scene || `环境场景 ${s.index + 1}`,
        locationName: s.locationName || `地点${s.index + 1}`,
        placeIntro:
          s.index === 0
            ? `${s.locationName || "主场景"}：故事发生地环境建立`
            : "",
        scenePrompt: `${body.aspectRatio || "16:9"} CG guoman cinematic environment establishing shot, ${s.scene || "cinematic location"}, no people, no characters, volumetric light`,
      }));
      return NextResponse.json({
        mode: "mock",
        shots,
        hint: "未登录豆包，已用本地模板补全场景提示词",
      });
    }

    if (body.mode === "characters") {
      type R = {
        characters: { name: string; appearance: string; locked?: boolean }[];
      };
      const shotHints = (body.shots || [])
        .map((s) => {
          const speakers = (s.lines || [])
            .map((l) => l.speaker)
            .filter(Boolean)
            .join("/");
          const intros = (s.characterIntros || [])
            .map((i) => i.name)
            .filter(Boolean)
            .join("/");
          return `镜${s.index + 1} 说话人:${speakers || "-"} 介绍:${intros || "-"} 场景:${s.scene}`;
        })
        .join("；");

      const { data, provider } = await callChatJson<R>(
        body.settings,
        characterPromptEnrichSystem(),
        buildCharacterPromptEnrichUser({
          premise: body.premise,
          style: body.style,
          characters: (body.characters || []).map((c) => ({
            name: c.name,
            appearance: c.appearance,
          })),
          shotHints,
        }),
      );

      const characters = mergeExtractedCharacters(
        body.characters || [],
        data.characters || [],
      );

      return NextResponse.json({
        mode: "live",
        provider,
        characters,
      });
    }

    type R = {
      shots: {
        index: number;
        scene: string;
        locationName?: string;
        placeIntro?: string;
        scenePrompt?: string;
      }[];
    };
    const { data, provider } = await callChatJson<R>(
      body.settings,
      scenePromptEnrichSystem(),
      buildScenePromptEnrichUser({
        premise: body.premise,
        style: body.style,
        aspectRatio: body.aspectRatio || "16:9",
        shots: (body.shots || []).map((s) => ({
          index: s.index,
          scene: s.scene,
          locationName: s.locationName,
          placeIntro: s.placeIntro,
          storyboardPrompt: s.storyboardPrompt,
        })),
      }),
    );
    return NextResponse.json({
      mode: "live",
      provider,
      shots: data.shots || [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "提示词生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
