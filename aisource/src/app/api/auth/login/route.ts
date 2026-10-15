import { NextResponse } from "next/server";
import {
  authPlatformLabel,
  isValidCnPhone,
  platformToAccountPlatform,
  type AuthPlatform,
} from "@/lib/auth";
import { uid } from "@/lib/id";
import { directLoginWithCode } from "@/lib/passport-sms";
import type { JimengAccount } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  platform: AuthPlatform;
  phone: string;
  code: string;
  /** 发码返回的会话，登录时必须回传 */
  handoff?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.platform || !["doubao", "jimeng", "xyq"].includes(body.platform)) {
      return NextResponse.json({ error: "无效平台" }, { status: 400 });
    }
    if (!isValidCnPhone(body.phone)) {
      return NextResponse.json(
        { error: "请输入有效的中国大陆手机号" },
        { status: 400 },
      );
    }
    if (!body.code?.trim()) {
      return NextResponse.json({ error: "请输入验证码" }, { status: 400 });
    }

    const result = await directLoginWithCode({
      platform: body.platform,
      phone: body.phone,
      code: body.code,
      handoff: body.handoff,
    });

    const account: JimengAccount | null = result.sessionId
      ? {
          id: uid("acc"),
          label: `${authPlatformLabel(body.platform)} ${result.label || ""}`.trim(),
          sessionId: result.sessionId,
          region: "cn",
          platform: platformToAccountPlatform(body.platform),
          phone: body.phone.replace(/\D/g, ""),
          loginAt: new Date().toISOString(),
          enabled: true,
          usedCount: 0,
        }
      : null;

    return NextResponse.json({
      ok: true,
      platform: body.platform,
      sessionId: result.sessionId,
      apiKey: result.apiKey,
      account,
      mode: "direct",
      message: `${authPlatformLabel(body.platform)}已注册登录成功，额度 session 已写入本机`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    const friendly =
      message === "fetch failed" || message.includes("ECONNREFUSED")
        ? "无法直连官方登录接口，请检查网络后重试"
        : message;
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
  }
}
