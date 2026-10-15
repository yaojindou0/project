import { NextResponse } from "next/server";
import { checkPassportSession } from "@/lib/passport-sms";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CheckBody {
  sessionId?: string;
  label?: string;
}

/** @deprecated 请用 /api/auth/check-session；保留兼容 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckBody;
    const result = await checkPassportSession({
      platform: "doubao",
      sessionId: body.sessionId || "",
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检测失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
