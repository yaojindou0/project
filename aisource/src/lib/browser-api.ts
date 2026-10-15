import {
  buildShotsFromMock,
  mockGenerateImage,
  mockGenerateScript,
  mockGenerateVideo,
} from "./mock";
import { enforceFirstAppearances } from "./shot-script";
import { uid } from "./id";
import type { CharacterCard, Shot } from "./types";
import { UPSTREAM_PATHS } from "./upstream-paths";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body) return {};
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** 统一成逻辑路由：script | image | video | enrich | chat-reply | auth-* */
function normalizeRoute(path: string): string {
  const url = (path.split("?")[0] || path).replace(/\/$/, "") || "/";
  const bare = url.replace(/^\/api(?=\/|$)/, "") || "/";

  if (
    bare === "/script" ||
    bare === UPSTREAM_PATHS.script ||
    bare.endsWith("/samantha/chat/completion")
  ) {
    return "/script";
  }
  if (
    bare === "/image" ||
    bare === UPSTREAM_PATHS.image ||
    bare.endsWith("/images/generations")
  ) {
    return "/image";
  }
  if (
    bare === "/video" ||
    bare === UPSTREAM_PATHS.video ||
    bare === UPSTREAM_PATHS.videoArk ||
    bare.endsWith("/chat/completion") ||
    bare.endsWith("/contents/generations/tasks")
  ) {
    // /samantha/chat/completion 已归 script；此处仅 /chat/completion
    if (bare.includes("/samantha/")) return "/script";
    return "/video";
  }
  if (
    bare === "/enrich" ||
    bare === UPSTREAM_PATHS.enrich.replace(/\/$/, "") ||
    bare.endsWith("/samantha/chat/enrich")
  ) {
    return "/enrich";
  }
  if (
    bare === "/chat-reply" ||
    bare === UPSTREAM_PATHS.chatReply.replace(/\/$/, "") ||
    bare.endsWith("/samantha/chat/reply")
  ) {
    return "/chat-reply";
  }
  if (
    bare === "/auth/send-code" ||
    bare.endsWith("/passport/web/send_code")
  ) {
    return "/auth/send-code";
  }
  if (bare === "/auth/login" || bare.endsWith("/passport/web/sms_login")) {
    return "/auth/login";
  }
  if (
    bare === "/auth/check-session" ||
    bare.endsWith("/passport/account/info/v2")
  ) {
    return "/auth/check-session";
  }
  return bare;
}

/**
 * 未配置在线原接口时：浏览器内演示（路径按上游原 URL）
 */
export async function handleStaticApi(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const route = normalizeRoute(path);
  const body = await readBody(init);

  try {
    if (route === "/script") {
      const premise = String(body.premise || "");
      const style = String(body.style || "");
      const shotCount = Number(body.shotCount || 4);
      const mock = await mockGenerateScript({ premise, style, shotCount });
      const shots = enforceFirstAppearances(buildShotsFromMock(mock.shots));
      return json({
        title: mock.title,
        characters: mock.characters,
        shots,
        mode: "static-html",
        provider: "mock",
        hint: "本地演示分镜（未命中原线上接口）。请检查 config.js 的 __JINGXU_ENDPOINTS__。",
      });
    }

    if (route === "/image") {
      const prompt = String(body.prompt || "scene");
      const index = Number(body.index || 0);
      const imageUrl = await mockGenerateImage(prompt, index);
      return json({ imageUrl, mode: "static-html" });
    }

    if (route === "/video") {
      const index = Number(body.index || 0);
      const imageUrl = String(body.imageUrl || "");
      const videoUrl = await mockGenerateVideo(imageUrl, index);
      return json({
        videoUrl,
        mode: "static-html",
        model: "demo-static",
        matchedCharacters: [],
        hint: "本地演示视频（未命中原线上接口）",
      });
    }

    if (route === "/enrich") {
      const mode = String(body.mode || "");
      if (mode === "characters") {
        const existing = (body.characters as CharacterCard[]) || [];
        const premise = String(body.premise || "");
        if (existing.length) {
          return json({
            characters: existing.map((c) => ({
              ...c,
              id: c.id || uid("char"),
              appearance:
                c.appearance ||
                `${c.name}，CG国漫电影级人物，五官清晰，服装细节完整`,
              locked: c.locked ?? true,
            })),
          });
        }
        const mock = await mockGenerateScript({
          premise,
          style: String(body.style || ""),
          shotCount: 4,
        });
        return json({ characters: mock.characters });
      }
      if (mode === "scenes") {
        const shots = (body.shots as Partial<Shot>[]) || [];
        return json({
          shots: shots.map((s, i) => ({
            index: s.index ?? i,
            scene: s.scene || "环境空镜",
            locationName: s.locationName || "",
            placeIntro: s.placeIntro || "",
            scenePrompt: `${s.scene || "cinematic location"}, CG guoman environment, no people`,
          })),
        });
      }
      return json({ error: "未知 enrich mode" }, 400);
    }

    if (route === "/chat-reply") {
      return json({
        text: "未命中原线上接口，无法续聊。请检查 config.js。",
        // 不返回假 conversationId，避免写进真实账号
      });
    }

    if (route === "/frame-from-video") {
      return json(
        {
          error:
            "静态包无法代理远程视频。请使用本镜已生成视频，或改用 Node 网页包 / 开发服务。",
        },
        501,
      );
    }

    if (
      route === "/auth/send-code" ||
      route === "/auth/login" ||
      route === "/auth/check-session"
    ) {
      return json({
        ok: true,
        message: "演示回退：请确认 config.js 原线上接口后再用手机号登录",
        sessionId: "",
      });
    }

    return json({ error: `静态版未实现: ${route}` }, 404);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "静态接口失败" },
      500,
    );
  }
}
