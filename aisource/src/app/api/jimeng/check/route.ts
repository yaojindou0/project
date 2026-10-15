import { NextResponse } from "next/server";
import { REGION_PREFIX, type JimengAccount, type JimengRegion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface CheckBody {
  jimengApiBase: string;
  account: Pick<JimengAccount, "sessionId" | "region" | "label">;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckBody;
    const base = (body.jimengApiBase || "").replace(/\/$/, "");
    if (!base) {
      return NextResponse.json({ ok: false, error: "缺少 API 基址" }, { status: 400 });
    }
    if (!body.account?.sessionId?.trim()) {
      return NextResponse.json({ ok: false, error: "缺少 sessionid" }, { status: 400 });
    }

    const region = (body.account.region || "cn") as JimengRegion;
    const token = `${REGION_PREFIX[region]}${body.account.sessionId.trim()}`;

    // 轻量探活：请求模型列表或根路径；失败时再试 /v1/models
    const started = Date.now();
    let status = 0;
    let detail = "";

    const tryUrls = [`${base}/v1/models`, `${base}/`, `${base}/ping`];
    for (const url of tryUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12_000),
        });
        status = res.status;
        detail = (await res.text()).slice(0, 240);
        if (res.ok || res.status === 401 || res.status === 403) break;
      } catch (e) {
        detail = e instanceof Error ? e.message : "连接失败";
      }
    }

    const ms = Date.now() - started;
    if (status === 401 || status === 403) {
      return NextResponse.json({
        ok: false,
        error: `鉴权失败(${status})，请检查 sessionid / 地区前缀`,
        ms,
        detail,
      });
    }
    if (status >= 200 && status < 500) {
      return NextResponse.json({
        ok: true,
        message: `服务可达 · ${body.account.label || "账号"} · ${ms}ms`,
        ms,
        status,
      });
    }

    return NextResponse.json({
      ok: false,
      error: `无法连接即梦 API（${status || "无响应"}）：${detail}`,
      ms,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检测失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
