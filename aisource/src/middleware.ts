import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 静态站跨域：上游原路径 + 旧短路径 + /api/* */
export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowOrigin = origin && origin !== "null" ? origin : "*";

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(allowOrigin),
    });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(allowOrigin))) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders(allowOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

export const config = {
  matcher: [
    "/api/:path*",
    "/samantha/:path*",
    "/chat/completion",
    "/passport/:path*",
    "/tmp-media/:path*",
    "/jimeng/:path*",
    "/script",
    "/image",
    "/video",
    "/enrich",
    "/chat-reply",
    "/auth/:path*",
    "/doubao/:path*",
  ],
};
