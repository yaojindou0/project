/**
 * 安卓开发代理：与 PC chat-reply 一致。
 * - 已有视频对话窗 → 视频能力续聊（可捞 videoUrl / 自动「确定」）
 * - 否则 → 新开普通对话
 */

import { doubaoWebChatText, resolveDoubaoAuth } from "./doubao-chat.mjs";
import { runContinueVideoUpstream } from "./video-upstream.mjs";

export async function runChatReplyUpstream(body, chatUrl) {
  const message = String(body?.message || body?.prompt || "").trim();
  if (!message) {
    const err = new Error("缺少消息内容");
    err.status = 400;
    throw err;
  }
  const { account, sessionId, cookieHeader } = resolveDoubaoAuth(body.settings);
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }

  const threadId =
    String(body.conversationId || "").trim() ||
    String(account?.conversationId || "").trim() ||
    "";

  // 与 PC 一致：已有视频对话窗走 ability 17 续聊
  if (threadId && threadId !== "0") {
    return runContinueVideoUpstream({
      message,
      conversationId: threadId,
      aspectRatio: body.aspectRatio,
      duration: body.duration,
      variant: body.variant,
      settings: body.settings,
    });
  }

  const context = String(body?.context || "").trim();
  const user = context
    ? `【分镜上下文】\n${context.slice(0, 800)}\n\n【用户】\n${message}`
    : message;
  const system =
    String(body?.system || "").trim() ||
    "你是豆包视频创作助手。用户在继续刚才的视频生成对话。简洁有用地回复，必要时说明如何改提示词或参考图。";
  const answer = await doubaoWebChatText({
    sessionId,
    cookieHeader,
    chatUrl,
    system,
    user,
    jsonMode: false,
  });
  return { text: answer, reply: answer, chatText: answer };
}
