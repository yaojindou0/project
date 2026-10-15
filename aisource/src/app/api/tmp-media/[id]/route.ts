import { NextResponse } from "next/server";
import { getTmpMedia } from "@/lib/tmp-media";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const hit = await getTmpMedia(id);
  if (!hit) {
    return NextResponse.json({ error: "媒体不存在或已过期" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(hit.bytes), {
    status: 200,
    headers: {
      "Content-Type": hit.mime,
      "Content-Length": String(hit.bytes.length),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
