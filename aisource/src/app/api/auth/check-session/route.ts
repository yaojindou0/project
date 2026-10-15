import { NextResponse } from "next/server";
import type { AuthPlatform } from "@/lib/auth";
import { checkPassportSession } from "@/lib/passport-sms";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  platform: AuthPlatform;
  sessionId?: string;
  label?: string;
}

/** 校验豆包 / 即梦 / 小云雀已注册登录 session 是否仍有效 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.platform || !["doubao", "jimeng", "xyq"].includes(body.platform)) {
      return NextResponse.json({ ok: false, error: "无效平台" }, { status: 400 });
    }
    if (!body.sessionId?.trim()) {
      return NextResponse.json({ ok: false, error: "缺少 sessionid" }, { status: 400 });
    }

    const result = await checkPassportSession({
      platform: body.platform,
      sessionId: body.sessionId,
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.message,
        ms: result.ms,
      });
    }

    return NextResponse.json({
      ok: true,
      message: body.label
        ? `${result.message} · ${body.label}`
        : result.message,
      name: result.name,
      ms: result.ms,
      platform: body.platform,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检测失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
