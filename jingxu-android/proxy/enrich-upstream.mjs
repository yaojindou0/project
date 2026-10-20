/**
 * 安卓开发代理：与 PC /api/enrich 相同入参，转发豆包对话后回 JSON。
 * mode=characters → { characters }；mode=scenes → { scenes }
 */

import {
  doubaoWebChatText,
  firstJsonObject,
  resolveDoubaoAuth,
  uid,
} from "./doubao-chat.mjs";

function charSystem() {
  return `你是角色设定师。只输出 JSON：{"characters":[{"name":"名","appearance":"外貌，须含CG国漫电影级质感","locked":true}]}
禁止 markdown。字符串内不要英文双引号。`;
}

function charUser(body) {
  const existing = (body.characters || [])
    .map((c) => `${c.name}：${c.appearance || ""}`)
    .join("\n");
  const fromShots = (body.shots || [])
    .flatMap((s) => [
      ...(s.characterIntros || []).map((x) => x.name),
      ...(s.lines || []).map((l) => l.speaker),
    ])
    .filter(Boolean);
  return `故事：${body.premise}
风格：${body.style || "国漫"}
已有角色：
${existing || "无"}
镜头里出现的名字：${[...new Set(fromShots)].join("、") || "无"}
请补全/生成角色卡 JSON。`;
}

function sceneSystem() {
  return `你是场景空镜提示词助手。只输出 JSON：{"scenes":[{"locationName":"地点","placeIntro":"简介","imagePrompt":"English empty environment prompt, no people"}]}
禁止 markdown。`;
}

function sceneUser(body) {
  const locs = (body.shots || [])
    .map((s) => `${s.locationName || ""}：${s.placeIntro || s.scene || ""}`)
    .filter((x) => x.replace("：", "").trim());
  return `故事：${body.premise}
风格：${body.style || "国漫"}
画幅：${body.aspectRatio || "16:9"}
地点列表：
${locs.join("\n") || "无"}
请为每个地点生成空镜提示词 JSON。`;
}

export async function runEnrichUpstream(body, enrichUrl) {
  const mode = body?.mode;
  if (mode !== "characters" && mode !== "scenes") {
    const err = new Error("enrich mode 须为 characters 或 scenes");
    err.status = 400;
    throw err;
  }
  const { sessionId, cookieHeader } = resolveDoubaoAuth(body.settings);
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }

  const answer = await doubaoWebChatText({
    sessionId,
    cookieHeader,
    chatUrl: enrichUrl,
    system: mode === "characters" ? charSystem() : sceneSystem(),
    user: mode === "characters" ? charUser(body) : sceneUser(body),
  });
  const parsed = firstJsonObject(answer);

  if (mode === "characters") {
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters
          .filter((c) => c?.name)
          .map((c) => ({
            id: uid("char"),
            name: String(c.name).trim(),
            appearance: String(c.appearance || "").trim() || "CG国漫电影级质感",
            locked: true,
          }))
      : [];
    return { characters };
  }

  const scenes = Array.isArray(parsed.scenes)
    ? parsed.scenes
        .filter((s) => s?.locationName || s?.imagePrompt)
        .map((s) => ({
          locationName: String(s.locationName || "").trim(),
          placeIntro: String(s.placeIntro || "").trim(),
          imagePrompt: String(s.imagePrompt || "").trim(),
        }))
    : [];
  return { scenes };
}
