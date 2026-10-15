import { NextResponse } from "next/server";
import {
  assertSendCodeAllowed,
  isValidCnPhone,
  type AuthPlatform,
} from "@/lib/auth";
import { PASSPORT_CONFIG } from "@/lib/passport-config";
import { directSendCode } from "@/lib/passport-sms";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  platform: AuthPlatform;
  phone: string;
}

export async function POST(req: Request) {
  let platform: AuthPlatform | null = null;
  try {
    const body = (await req.json()) as Body;
    platform = body.platform;
    if (!body.platform || !["doubao", "jimeng", "xyq"].includes(body.platform)) {
      return NextResponse.json({ error: "无效平台" }, { status: 400 });
    }
    if (!isValidCnPhone(body.phone)) {
      return NextResponse.json(
        { error: "请输入有效的中国大陆手机号" },
        { status: 400 },
      );
    }

    const result = await directSendCode({
      platform: body.platform,
      phone: body.phone,
    });

    // 仅成功发码后计入本地限频，避免滑块失败也锁 60 秒
    try {
      assertSendCodeAllowed(body.phone);
    } catch {
      /* 官方已发出，忽略本地限频冲突 */
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      requestId: result.requestId,
      handoff: result.handoff,
      mode: "direct",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发送失败";
    const risk =
      Boolean((error as { risk?: boolean })?.risk) ||
      /滑块|风控|验证码请求被官方拒绝/.test(message);
    const friendly =
      message === "fetch failed" || message.includes("ECONNREFUSED")
        ? "无法直连官方短信接口，请检查网络后重试"
        : message;

    const fromHint = friendly.match(/\|官网:(https?:\/\/\S+)/);
    const officialUrl =
      fromHint?.[1] ||
      (platform && risk ? PASSPORT_CONFIG[platform].officialLoginUrl : null);

    return NextResponse.json(
      {
        ok: false,
        error: friendly,
        risk,
        officialUrl,
        errorCode: (error as { errorCode?: number })?.errorCode,
      },
      { status: 500 },
    );
  }
}
