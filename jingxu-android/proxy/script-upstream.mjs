/**
 * 安卓开发代理：收到与 PC 相同的分镜 JSON，再按豆包网页对话协议转发到 config.js 的 script 地址。
 * 返回 { title, characters, shots }，不经过电脑 Next。
 */

import {
  doubaoWebChatText,
  firstJsonObject,
  resolveDoubaoAuth,
  uid,
} from "./doubao-chat.mjs";

function systemPrompt() {
  return `你是 AI 漫剧分镜导演。只输出一个 JSON 对象，禁止 markdown。
Schema：{"title":"剧名","characters":[{"name":"名","appearance":"外貌，须含CG国漫电影级质感","locked":true}],"shots":[{"scene":"画面","locationName":"地点","placeIntro":"首次出现才写","characterIntros":[{"name":"名","intro":"首次登场才写"}],"lines":[{"kind":"dialogue","speaker":"名","text":"台词"}],"dialogue":"摘要","camera":"运镜","imagePrompt":"English CG guoman prompt","storyboardPrompt":"中文分镜词"}]}
规则：shots 数量等于用户指定镜头数；字符串内不要英文双引号，引用用「」；保留原故事，禁止改编结局。`;
}

function userPrompt(body) {
  const locked = (body.lockedCharacters || [])
    .filter((c) => c.locked)
    .map((c) => `${c.name}（${c.appearance}）`)
    .join("；");
  return `故事内容：
${body.premise}

风格：${body.style || "国漫"}
镜头数：必须恰好 ${body.shotCount || 6} 条
固定角色：${locked || "无"}
请输出完整 JSON。`;
}

function normalize(parsed, body) {
  const shotCount = Math.max(1, Math.min(30, Number(body.shotCount) || 6));
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
  // 与 PC normalizeShot 一致：index 从 0 起，UI 再显示「镜{{index+1}}」
  const shots = Array.isArray(parsed.shots)
    ? parsed.shots.slice(0, shotCount).map((s, i) => ({
        id: uid("shot"),
        index: i,
        scene: String(s.scene || "").trim() || `镜头${i + 1}`,
        locationName: String(s.locationName || "").trim(),
        placeIntro: String(s.placeIntro || "").trim(),
        characterIntros: Array.isArray(s.characterIntros)
          ? s.characterIntros
              .filter((x) => x?.name)
              .map((x) => ({
                name: String(x.name).trim(),
                intro: String(x.intro || "").trim(),
              }))
          : [],
        lines: Array.isArray(s.lines)
          ? s.lines
              .filter((l) => l?.text)
              .map((l) => ({
                kind: l.kind === "narration" ? "narration" : "dialogue",
                speaker: String(l.speaker || "").trim(),
                text: String(l.text).trim(),
              }))
          : [],
        dialogue: String(s.dialogue || "").trim(),
        camera: String(s.camera || "").trim() || "中景",
        imagePrompt: String(s.imagePrompt || "").trim(),
        storyboardPrompt: String(s.storyboardPrompt || "").trim(),
      }))
    : [];
  while (shots.length < shotCount) {
    const i = shots.length;
    shots.push({
      id: uid("shot"),
      index: i,
      scene: `镜头${i + 1}`,
      locationName: "",
      placeIntro: "",
      characterIntros: [],
      lines: [],
      dialogue: "",
      camera: "中景",
      imagePrompt: "",
      storyboardPrompt: "",
    });
  }
  return {
    title: String(parsed.title || "").trim() || "未命名漫剧",
    characters,
    shots,
  };
}

export async function runScriptUpstream(body, scriptUrl) {
  const premise = String(body?.premise || "").trim();
  if (!premise) {
    const err = new Error("请先填写故事内容");
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
    chatUrl: scriptUrl,
    system: systemPrompt(),
    user: userPrompt(body),
  });
  const parsed = firstJsonObject(answer);
  return normalize(parsed, body);
}
