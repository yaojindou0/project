import { NextResponse } from "next/server";
import {
  doubaoWebChatText,
  doubaoWebContinueForVideo,
  seedDoubaoWebCookies,
} from "@/lib/doubao-web-chat";
import {
  persistAccountConversationId,
  resolveAccountConversationId,
  resolveDoubaoWebAccount,
} from "@/lib/doubao-session";
import type { ApiSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  message: string;
  conversationId?: string;
  settings: ApiSettings;
  /** 可选：本镜上下文，帮助续聊 */
  context?: string;
  /** 续聊时若期望捞视频，传画幅/时长 */
  aspectRatio?: string;
  duration?: number;
  variant?: "mini" | "fast";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "请输入回复内容" }, { status: 400 });
    }
    const account = resolveDoubaoWebAccount(body.settings);
    if (!account?.sessionId?.trim()) {
      return NextResponse.json(
        { error: "请先登录豆包网页账号" },
        { status: 400 },
      );
    }
    seedDoubaoWebCookies(account.sessionId, account.cookieHeader);

    const threadId =
      (body.conversationId || "").trim() ||
      (account.conversationId || "").trim() ||
      resolveAccountConversationId(body.settings) ||
      "";

    // 已有视频对话窗：走视频能力续聊，并从聊天结果里直接取视频
    if (threadId && threadId !== "0") {
      const result = await doubaoWebContinueForVideo({
        sessionId: account.sessionId,
        cookieHeader: account.cookieHeader,
        message,
        conversationId: threadId,
        ratio: body.aspectRatio,
        duration: body.duration,
        variant: body.variant,
        timeoutMs: 300_000,
      });
      let accounts = body.settings.jimengAccounts;
      const nextSettings = persistAccountConversationId(
        { ...body.settings, jimengAccounts: accounts },
        result.conversationId,
        account.id,
      );
      accounts = nextSettings.jimengAccounts;
      return NextResponse.json({
        text: result.chatText || (result.videoUrl ? "视频已生成" : ""),
        videoUrl: result.videoUrl,
        conversationId: result.conversationId,
        model: result.model,
        accounts,
      });
    }

    const user = body.context?.trim()
      ? `【分镜上下文】\n${body.context.trim().slice(0, 800)}\n\n【用户】\n${message}`
      : message;

    const result = await doubaoWebChatText({
      sessionId: account.sessionId,
      user,
      conversationId: body.conversationId,
      keepThread: true,
      system:
        "你是豆包视频创作助手。用户在继续刚才的视频生成对话。简洁有用地回复，必要时说明如何改提示词或参考图。",
    });

    const nextSettings = persistAccountConversationId(
      body.settings,
      result.conversationId,
      account.id,
    );

    return NextResponse.json({
      text: result.text,
      conversationId: result.conversationId,
      accounts: nextSettings.jimengAccounts,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "回复失败" },
      { status: 500 },
    );
  }
}
