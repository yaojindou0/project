import { NextResponse } from "next/server";
import { shouldUseMock } from "@/lib/ai";
import { callChatJson, hasDoubaoAuth } from "@/lib/doubao-content";
import { buildShotsFromMock, mockGenerateScript } from "@/lib/mock";
import { buildUserScriptPrompt, scriptSystemPrompt } from "@/lib/prompts";
import type { ApiSettings, CharacterCard, Shot } from "@/lib/types";
import { uid } from "@/lib/id";
import {
  flattenDialogue,
  enforceFirstAppearances,
  normalizeCharacterIntros,
  normalizeLines,
} from "@/lib/shot-script";

export const runtime = "nodejs";
export const maxDuration = 180;

interface ScriptBody {
  premise: string;
  style: string;
  shotCount?: number;
  aspectRatio?: string;
  settings: ApiSettings;
  lockedCharacters?: CharacterCard[];
}

function normalizeShot(
  s: Partial<Shot> & {
    motionPrompt?: string;
    storyboardPrompt?: string;
    lines?: unknown;
    characterIntros?: unknown;
  },
  index: number,
): Shot {
  const lines = normalizeLines(s.lines, s.dialogue);
  const dialogue = flattenDialogue(lines) || s.dialogue || "";
  const characterIntros = normalizeCharacterIntros(s.characterIntros);
  const storyboardPrompt =
    s.storyboardPrompt ||
    s.motionPrompt ||
    [s.scene, s.camera, dialogue].filter(Boolean).join("。");
  return {
    id: uid("shot"),
    index,
    scene: s.scene || `镜头 ${index + 1}`,
    locationName: s.locationName || "",
    placeIntro: s.placeIntro || "",
    characterIntros,
    lines,
    dialogue,
    camera: s.camera || "固定镜头",
    imagePrompt: s.imagePrompt || storyboardPrompt,
    storyboardPrompt,
    status: "pending",
  };
}

function normalizeCharacter(c: Partial<CharacterCard>): CharacterCard {
  return {
    id: c.id || uid("char"),
    name: c.name || "角色",
    appearance: c.appearance || "",
    referenceImageUrl: c.referenceImageUrl,
    threeViewUrl: c.threeViewUrl,
    locked: c.locked ?? true,
  };
}

async function mockScriptResponse(
  body: ScriptBody,
  shotCount: number,
  hint?: string,
) {
  const mock = await mockGenerateScript({
    premise: body.premise,
    style: body.style,
    shotCount,
  });
  const characters = mock.characters.map((c) => {
    const locked = body.lockedCharacters?.find((l) => l.name === c.name);
    return locked
      ? {
          ...c,
          ...locked,
          locked: true,
          referenceImageUrl: locked.referenceImageUrl || c.referenceImageUrl,
        }
      : c;
  });
  return NextResponse.json({
    mode: "mock",
    provider: "local",
    title: mock.title,
    characters,
    shots: enforceFirstAppearances(buildShotsFromMock(mock.shots)),
    hint:
      hint ||
      "未登录豆包，已用本地拆镜。请手机号登录豆包后使用网页对话拆镜",
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ScriptBody;
    const shotCount = body.shotCount ?? 4;
    const aspectRatio = body.aspectRatio ?? "16:9";

    if (!body.premise?.trim()) {
      return NextResponse.json({ error: "请输入故事内容" }, { status: 400 });
    }

    if (shouldUseMock(body.settings) || !hasDoubaoAuth(body.settings)) {
      return mockScriptResponse(
        body,
        shotCount,
        body.settings.useMock
          ? undefined
          : "请先手机号登录豆包；当前已用本地拆镜",
      );
    }

    type LlmResult = {
      title: string;
      characters: CharacterCard[];
      shots: (Partial<Shot> & { motionPrompt?: string })[];
    };

    try {
      const { data: result, provider } = await callChatJson<LlmResult>(
        body.settings,
        scriptSystemPrompt(),
        buildUserScriptPrompt({
          premise: body.premise,
          style: body.style,
          shotCount,
          aspectRatio,
          lockedCharacters: (body.lockedCharacters || [])
            .filter((c) => c.locked)
            .map((c) => ({ name: c.name, appearance: c.appearance })),
        }),
      );

      let shotList = result.shots || [];
      // 数量纠偏：过多截断，过少用已有镜复制补齐再规范化
      if (shotList.length > shotCount) {
        shotList = shotList.slice(0, shotCount);
      } else if (shotList.length > 0 && shotList.length < shotCount) {
        const base = shotList[shotList.length - 1];
        while (shotList.length < shotCount) {
          shotList.push({
            ...base,
            scene: `${base.scene || "续镜"}（${shotList.length + 1}）`,
          });
        }
      }

      if (!shotList.length) {
        return mockScriptResponse(
          body,
          shotCount,
          "豆包分镜未返回镜头，已用本地拆镜兜底",
        );
      }

      const shots = enforceFirstAppearances(
        shotList.map((s, index) => normalizeShot(s, index)),
      );
      const characters = (result.characters || []).map(normalizeCharacter);

      return NextResponse.json({
        mode: "live",
        provider,
        title: result.title || "未命名漫剧",
        characters,
        shots,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "分镜失败";
      // JSON 损坏 / 登录 / 风控：本地拆镜兜底，避免创作台卡死
      if (
        /401|session|登录|风控|403|过载|额度|JSON|格式损坏|解析/i.test(message)
      ) {
        return mockScriptResponse(body, shotCount, `豆包分镜异常：${message}；已用本地拆镜`);
      }
      throw e;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "分镜生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
