import { aspectEnHint, aspectPromptHint } from "./aspect";
import { ensureRenderStyle, ensureSceneRenderStyle } from "./render-style";

export function scriptSystemPrompt() {
  return `你是 AI 漫剧分镜导演。只输出一个 JSON 对象，禁止 markdown、禁止注释、禁止前后说明文字。
核心职责：把用户给出的「故事内容」忠实切成镜头，不是再创作。
Schema：
{
  "title":"剧名（尽量用故事原有标题或关键健情节点概括，勿另起无关新剧名）",
  "characters":[{"name":"名","appearance":"外貌服装（须含CG国漫电影级质感描述）","locked":true}],
  "shots":[{
    "scene":"画面场景概述（对应故事该段情节）",
    "locationName":"地点名（如青云城西市）",
    "placeIntro":"若本镜是该地名首次出现则写介绍，否则空字符串",
    "characterIntros":[{"name":"角色名","intro":"若本镜是该角色首次登场则写身份气质介绍，否则不要列入"}],
    "lines":[
      {"kind":"dialogue","speaker":"角色名","text":"对白内容"},
      {"kind":"monologue","speaker":"角色名","text":"独白内容"},
      {"kind":"aside","speaker":"","text":"旁白"},
      {"kind":"inner","speaker":"角色名","text":"内心独白"}
    ],
    "dialogue":"把 lines 压成一行摘要（兼容字段）",
    "camera":"运镜",
    "imagePrompt":"English image prompt, must include CG guoman cinematic render",
    "storyboardPrompt":"中文 Seedance 分镜词：主体+动作+情绪+环境+运镜，并写明CG国漫电影级渲染"
  }]
}
规则：
1. 合法 JSON.parse；字符串内绝不出现英文双引号，引用用「」。
2. shots 数量严格等于用户指定镜头数；字段齐全。
3. 【剧情保真·最高优先级】完整保留故事内容中的全部剧情：人物、关系、冲突、因果、转折、结局、关键台词与关键动作；禁止擅自改编、删改主线、调换结局、合并/省略重要情节、另写支线或加戏。
4. 只做分镜化：按时间顺序把原故事切成镜头；镜头间须覆盖故事从开头到结尾的所有关键节点，不得跳过中间情节。
5. 故事里已有的对白/独白/旁白尽量原文沿用；没有写明台词时，可用极短旁白补足画面信息，但不得编造改变剧情走向的新对白或新事件。
6. 角色姓名、身份、关系以故事原文为准；不得改名、换立场或新增无关主角。
7. 同一地名、同一人物：仅在全剧首次出现的那一镜填写 placeIntro / characterIntros，后续镜留空或省略。
8. 一镜可多条 lines：对白 dialogue、独白 monologue、旁白 aside、内心 inner；原故事有对话的戏至少保留对应条数。
9. storyboardPrompt / imagePrompt 必须体现 CG国漫电影级渲染（干净轮廓、高细节、统一光影），禁止平涂二次元与水墨风；画风描述不得覆盖或改写剧情事实。`;
}

export function buildUserScriptPrompt(input: {
  premise: string;
  style: string;
  shotCount: number;
  aspectRatio: string;
  lockedCharacters?: { name: string; appearance: string }[];
}) {
  const locked =
    input.lockedCharacters && input.lockedCharacters.length
      ? `\n已锁定角色（必须沿用姓名与设定，不得改名改编）：${input.lockedCharacters
          .map((c) => `${c.name}（${c.appearance}）`)
          .join("；")}`
      : "";
  return `【必须忠实执行】以下「故事内容」是唯一剧情来源。生成分镜时保留全部剧情内容，按原顺序覆盖所有关键情节；禁止擅自改编、删减主线、改结局、加戏或另写故事。
故事内容：
${input.premise}

画面风格：${input.style}
（默认且必须：CG国漫电影级渲染，干净轮廓线，高细节，统一光影，禁止平涂二次元；风格只影响画面质感，不得改剧情）
镜头数量：${input.shotCount}（用这些镜头完整装下上述故事，宁细勿漏）
画幅：${input.aspectRatio}${locked}
请生成完整分镜 JSON：每镜含多台词 lines（对白/独白/旁白/内心）、地名首次介绍 placeIntro、人物首次登场 characterIntros；仅 JSON，字段内用「」。`;
}

/** 从故事/分镜提取全部人物，并生成外貌锚定提示词（输出完整角色卡列表） */
export function characterPromptEnrichSystem() {
  return `你是 CG 国漫漫剧角色设定师。只输出 JSON，不要 markdown。
Schema：{"characters":[{"name":"角色名","appearance":"外貌锚定长描述：年龄气质、五官发型、体型、服装配饰、表情习惯；必须含CG国漫电影级质感，禁止二次元平涂","locked":true}]}
规则：
1. 字段内禁止英文双引号，用「」。
2. 必须从故事与分镜中提取全部具名人物（含对白说话人、人物介绍），不要遗漏配角；路人甲乙若无名可省略。
3. 若已有角色卡，保留其姓名并强化 appearance；新发现的人物也要新建卡片。
4. 每位 appearance 80–180 字；输出 characters 为完整列表（不是补丁）。`;
}

export function buildCharacterPromptEnrichUser(input: {
  premise: string;
  style: string;
  characters: { name: string; appearance?: string }[];
  shotHints?: string;
}) {
  return `故事：${input.premise}
画面风格：${input.style}
已有角色卡：${JSON.stringify(input.characters)}
分镜人物线索：${input.shotHints || "无"}
请提取故事中全部相关人物，为每人生成角色卡（name + appearance），并返回完整 characters 数组以便前端展示所有角色卡片。`;
}

/** 批量补全各镜场景环境提示词（无人空镜用） */
export function scenePromptEnrichSystem() {
  return `你是电影场景美术。只输出 JSON，不要 markdown。
Schema：{"shots":[{"index":0,"scene":"环境场景概述（不要写人物动作）","locationName":"地点名","placeIntro":"若该地首次出现则介绍，否则空","scenePrompt":"无人环境空镜提示，只写建筑自然道具光影，明确 no people，构图比例与项目画幅一致"}]}
规则：字段内禁止英文双引号；scene/scenePrompt 禁止出现人物；适合 CG国漫电影级环境；scenePrompt 必须写明画幅比例。`;
}

export function buildScenePromptEnrichUser(input: {
  premise: string;
  style: string;
  aspectRatio: string;
  shots: {
    index: number;
    scene: string;
    locationName?: string;
    placeIntro?: string;
    storyboardPrompt?: string;
  }[];
}) {
  return `故事：${input.premise}
画面风格：${input.style}
画幅：${input.aspectRatio}（场景提示词必须使用该比例）
现有分镜：${JSON.stringify(input.shots)}
请为每镜补全无人场景提示（scene / locationName / placeIntro / scenePrompt）。地名介绍仅首次出现填写。`;
}

/** 角色三视图生图提示 */
export function buildCharacterThreeViewPrompt(input: {
  name: string;
  appearance: string;
  style: string;
  aspectRatio: string;
}) {
  return ensureRenderStyle(
    `角色设定三视图 character turnaround sheet，同一角色正面、侧面、背面并排，纯色浅灰背景，全身站立，细节清晰，服装与发型一致。角色名：${input.name}。外貌：${input.appearance}。${aspectPromptHint(input.aspectRatio)}，禁止文字水印，高清。 ${aspectEnHint(input.aspectRatio)}.`,
    input.style,
  );
}

/** 场景图：纯环境空镜、不要人物；比例与画幅选项一致 */
export function buildSceneImagePrompt(input: {
  scene: string;
  storyboardPrompt: string;
  style: string;
  aspectRatio: string;
  locationName?: string;
  placeIntro?: string;
  scenePrompt?: string;
}) {
  const place = [input.locationName, input.placeIntro]
    .filter(Boolean)
    .join("，");
  const ratioZh = aspectPromptHint(input.aspectRatio);
  const ratioEn = aspectEnHint(input.aspectRatio);
  return ensureSceneRenderStyle(
    input.scenePrompt?.trim()
      ? `${input.scenePrompt.trim()}。场景：${input.scene}。${place ? `地点：${place}。` : ""}${ratioZh}，无人像。 ${ratioEn}.`
      : `电影感场景空镜，纯环境建立镜头，画面中不要出现任何人物、人脸、剪影、路人。只拍建筑、自然、道具与氛围光影。场景：${input.scene}。${place ? `地点：${place}。` : ""}氛围参考：${input.storyboardPrompt.slice(0, 220)}。${ratioZh}，无字幕，无人像。 ${ratioEn}, no people.`,
    input.style,
  );
}

/** 首帧 */
export function buildFirstFramePrompt(input: {
  scene: string;
  storyboardPrompt: string;
  imagePrompt: string;
  style: string;
  aspectRatio: string;
  characters?: string;
}) {
  return ensureRenderStyle(
    `漫剧关键帧静帧，叙事构图。${input.imagePrompt || input.storyboardPrompt}。场景：${input.scene}。${input.characters ? `角色一致：${input.characters}` : ""} ${aspectPromptHint(input.aspectRatio)}，电影光影，无字幕。 ${aspectEnHint(input.aspectRatio)}.`,
    input.style,
  );
}

/** 末帧 */
export function buildLastFramePrompt(input: {
  scene: string;
  storyboardPrompt: string;
  style: string;
  aspectRatio: string;
  characters?: string;
}) {
  return ensureRenderStyle(
    `漫剧本镜结束定格帧（末帧），承接动作余韵与情绪落点。场景：${input.scene}。分镜：${input.storyboardPrompt.slice(0, 320)}。${input.characters ? `角色一致：${input.characters}` : ""} 与首帧同一角色造型，${aspectPromptHint(input.aspectRatio)}，构图可推进到动作终点，无字幕。 ${aspectEnHint(input.aspectRatio)}.`,
    input.style,
  );
}
