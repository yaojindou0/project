import fs from "fs";
import path from "path";
import os from "os";

const js = fs.readFileSync(path.join(os.tmpdir(), "vs.js"), "utf8");
const idx = js.indexOf("share/page");
console.log("idx", idx);
for (const needle of [
  "share/page",
  "get_video_model",
  "fallback_api",
  "video_id",
  "share_id",
  "alice/resource",
]) {
  let from = 0;
  let n = 0;
  while (n < 5) {
    const i = js.indexOf(needle, from);
    if (i < 0) break;
    console.log("\n---", needle, i, "---");
    console.log(js.slice(Math.max(0, i - 120), i + 220).replace(/\s+/g, " "));
    from = i + needle.length;
    n++;
  }
}
