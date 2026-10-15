import fs from "fs";
import path from "path";
import os from "os";

const file = path.join(os.tmpdir(), "doubao-share.html");
const h = fs.readFileSync(file, "utf8");
const keys = [
  "bytev",
  "vlabvod",
  "mediasource",
  ".mp4",
  "video_model",
  "play_url",
  "main_url",
  "playAddr",
  "video_url",
  "RENDER_DATA",
  "__NEXT_DATA__",
  "share_id",
  "video_id",
  "og:video",
  "og:image",
];
for (const k of keys) console.log(k, h.split(k).length - 1);

const urls = [...h.matchAll(/https?:\\\/\\\/[^"'\\\s]+/g)].map((m) =>
  m[0].replace(/\\\//g, "/"),
);
const plain = [...h.matchAll(/https?:\/\/[^"'\\\s<>]+/g)].map((m) => m[0]);
const all = [...new Set([...urls, ...plain])];
const interesting = all.filter((u) =>
  /mp4|bytev|vlabvod|mediasource|vod|video|tos-|snssdk|bytedance/i.test(u),
);
console.log("interesting", interesting.length);
console.log(interesting.slice(0, 30).join("\n"));

const meta = [...h.matchAll(/property="og:[^"]+"\s+content="([^"]+)"/gi)];
console.log(
  "og",
  meta.map((m) => m[0].slice(0, 180)),
);

const scripts = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
console.log("scripts", scripts.length);
for (const s of scripts.slice(0, 20)) {
  const body = s[1] || "";
  if (/video|share|mp4|bytev/i.test(body) && body.length > 80) {
    console.log("--- script len", body.length, "---");
    console.log(body.slice(0, 400));
  }
}
