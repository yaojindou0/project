/**
 * 安卓开发代理：与 PC chat-reply 一致。
 * 必须在已绑定的视频对话窗续聊，保证问答同步到该豆包账号同一聊天。
 */

import { resolveDoubaoAuth } from "./doubao-chat.mjs";
import { runContinueVideoUpstream } from "./video-upstream.mjs";

export async function runChatReplyUpstream(body, _chatUrl) {
  const message = String(body?.message || body?.prompt || "").trim();
  if (!message) {
    const err = new Error("缺少消息内容");
    err.status = 400;
    throw err;
  }
  const { account, sessionId } = resolveDoubaoAuth(body.settings);
  if (!sessionId) {
    const err = new Error("请先在设置里登录豆包，或粘贴网页 session");
    err.status = 400;
    throw err;
  }

  const threadId =
    String(body.conversationId || "").trim() ||
    String(account?.conversationId || "").trim() ||
    "";

  if (!threadId || threadId === "0") {
    const err = new Error(
      "尚未绑定豆包对话窗。请先生成一次视频，之后的问答才会同步到同一豆包对话。",
    );
    err.status = 400;
    throw err;
  }

  return runContinueVideoUpstream({
    message,
    conversationId: threadId,
    aspectRatio: body.aspectRatio,
    duration: body.duration,
    variant: body.variant,
    settings: body.settings,
  });
}
