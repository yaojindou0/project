import fs from "fs";
import path from "path";
import os from "os";

const h = fs.readFileSync(path.join(os.tmpdir(), "vs.js"), "utf8");
const keys = [
  "get_video_model",
  "fallback_api",
  "alice/resource",
  "main_url",
  "key_seed",
  "FPLAY",
  "unwatermarked",
  "share_id",
];
for (const k of keys) console.log(k, h.split(k).length - 1);
const hits = [...h.matchAll(/get_video_model[^"']{0,40}/g)].slice(0, 10);
console.log(hits.map((m) => m[0]));
const urls = [...h.matchAll(/https?:\\\/\\\/[^"'`]{8,100}/g)]
  .map((m) => m[0].replace(/\\\//g, "/"))
  .filter((u, i, a) => a.indexOf(u) === i && /alice|snssdk|fplay|video/i.test(u));
console.log(urls.slice(0, 30).join("\n"));
