import type { CharacterCard, Shot } from "./types";
import { uid } from "./id";

const SAMPLE_VIDEOS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
];

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=720&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=720&q=80",
  "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=720&q=80",
  "https://images.unsplash.com/photo-1634017839464-5c339bbe3c3b?w=720&q=80",
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=720&q=80",
  "https://images.unsplash.com/photo-1614850715649-1d0106293bd1?w=720&q=80",
];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mockGenerateScript(input: {
  premise: string;
  style: string;
  shotCount: number;
}): Promise<{
  title: string;
  characters: CharacterCard[];
  shots: Omit<Shot, "id" | "status" | "index">[];
}> {
  await delay(900 + Math.random() * 600);

  const title =
    input.premise.slice(0, 12).replace(/\s+/g, "") || "未命名漫剧";

  const characters: CharacterCard[] = [
    {
      id: uid("char"),
      name: "林澈",
      appearance:
        "20岁青年，黑发微乱，深色外套，眼神清澈带倔强，CG国漫电影级人物，干净轮廓与高细节服装",
      locked: true,
    },
    {
      id: uid("char"),
      name: "苏晚",
      appearance:
        "同龄少女，长发及腰，浅色风衣，神情冷静克制，细微情绪外露，CG国漫电影级人物，统一光影质感",
      locked: true,
    },
  ];

  const templates = [
    {
      scene: "雨夜巷口，霓虹倒映在积水中，两人遥遥对望",
      dialogue: "林澈：你还是来了。",
      camera: "缓慢推镜，从全景推进到半身",
      motion: "细雨飘落，霓虹灯光轻微闪烁，人物衣角被风吹动",
    },
    {
      scene: "咖啡店窗边，蒸汽升腾，对话停顿后的沉默",
      dialogue: "苏晚：有些话，说过就回不去了。",
      camera: "固定镜头，浅景深，焦点从蒸汽移到人物侧脸",
      motion: "杯沿热气缓慢升起，人物睫毛轻颤，窗外车辆虚影掠过",
    },
    {
      scene: "天台边缘，城市灯火像星河流淌",
      dialogue: "林澈：如果重来一次，我还会站在这里。",
      camera: "环绕运镜，从侧面绕到正面特写",
      motion: "夜风吹动头发，远处车流光轨缓慢流动，呼吸可见",
    },
    {
      scene: "旧教室夕阳斜照，粉笔灰在光柱中漂浮",
      dialogue: "苏晚：那时的我们，好像更勇敢一点。",
      camera: "低角度仰拍，镜头轻微上摇",
      motion: "光尘漂浮，人物缓缓转身，桌椅阴影拉长",
    },
    {
      scene: "地铁车厢，人群熙攘却彼此孤岛",
      dialogue: "旁白：城市很大，心却很小。",
      camera: "手持轻微晃动，过肩镜头",
      motion: "车厢轻微晃动，窗外隧道灯光连续掠过，人物握紧扶手",
    },
    {
      scene: "清晨巷弄早餐摊，烟火气重新回来",
      dialogue: "林澈：今天，要不要一起走走？",
      camera: "跟拍，从后侧跟随两人并肩前行",
      motion: "蒸汽升腾，行人穿梭，阳光从屋檐缝隙洒落",
    },
  ];

  const count = Math.min(Math.max(input.shotCount, 3), 8);
  const shots = Array.from({ length: count }, (_, i) => {
    const t = templates[i % templates.length];
    const isFirst = i === 0;
    return {
      scene: t.scene,
      locationName: isFirst ? "雨巷霓虹城" : "雨巷霓虹城",
      placeIntro: isFirst ? "雨巷霓虹城：潮湿石板路与倒映霓虹的小城入口" : "",
      characterIntros: isFirst
        ? [
            { name: "林澈", intro: "想离开这座城的青年，倔强而克制" },
            { name: "苏晚", intro: "仍在等待一句未说出口的话的少女" },
          ]
        : [],
      lines: [
        {
          id: uid("line"),
          kind: "dialogue" as const,
          speaker: "林澈",
          text: t.dialogue.replace(/^[^：:]+[：:]/, "").trim() || t.dialogue,
        },
        ...(i % 2 === 1
          ? [
              {
                id: uid("line"),
                kind: "monologue" as const,
                speaker: "苏晚",
                text: "有些话，说过就回不去了。",
              },
            ]
          : [
              {
                id: uid("line"),
                kind: "aside" as const,
                speaker: "",
                text: "雨丝斜织，旧事重逢。",
              },
            ]),
      ],
      dialogue: t.dialogue,
      camera: t.camera,
      imagePrompt: `${input.style}, ${t.scene}, CG guoman cinematic keyframe, clean outlines, high detail, cinematic composition`,
      storyboardPrompt: `主体：林澈与苏晚。场景：${t.scene}。动作与氛围：${t.motion}。台词：「${t.dialogue}」。运镜：${t.camera}。保持角色外貌一致，漫剧电影感，自然微动。`,
    };
  });

  return { title: `《${title}》`, characters, shots };
}

export async function mockGenerateImage(prompt: string, index: number) {
  await delay(700 + Math.random() * 500);
  return (
    SAMPLE_IMAGES[index % SAMPLE_IMAGES.length] +
    `&sig=${encodeURIComponent(prompt.slice(0, 20))}`
  );
}

export async function mockGenerateVideo(imageUrl: string, index: number) {
  await delay(1200 + Math.random() * 800);
  void imageUrl;
  return SAMPLE_VIDEOS[index % SAMPLE_VIDEOS.length];
}

export function buildShotsFromMock(
  raw: Omit<Shot, "id" | "status" | "index">[],
): Shot[] {
  return raw.map((s, index) => ({
    ...s,
    id: uid("shot"),
    index,
    status: "pending" as const,
  }));
}
