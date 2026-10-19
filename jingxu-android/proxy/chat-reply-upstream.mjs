/**
 * 安卓开发代理：与 PC chat-reply 类似，创作台 JSON → 豆包对话 → { reply }
 */

import {
  doubaoWebChatText,
  pickDoubaoAccount,
} from "./doubao-chat.mjs";

export async function runChatReplyUpstream(body, chatUrl) {
  const message = String(body?.message || body?.prompt || "").trim();
  if (!message) {
    const err = new Error("缺少消息内容");
    err.status = 400;
    throw err;
  }
  const account = pickDoubaoAccount(body.settings);
  const sessionId = String(
    account?.sessionId || body.settings?.doubaoSessionId || "",
  ).trim();
  const cookieHeader = String(
    account?.cookie || body.settings?.doubaoCookie || "",
  ).trim();
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }

  const system =
    String(body?.system || "").trim() ||
    "你是镜叙漫剧助手。简洁回答用户关于分镜、角色、风格的问题。";
  const answer = await doubaoWebChatText({
    sessionId,
    cookieHeader,
    chatUrl,
    system,
    user: message,
    jsonMode: false,
  });
  return { reply: answer };
}
