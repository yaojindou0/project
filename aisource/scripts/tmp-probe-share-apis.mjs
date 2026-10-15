import fs from "fs";
import path from "path";
import os from "os";

const files = ["vs.js", "doubao-share.html"].map((f) =>
  path.join(os.tmpdir(), f),
);
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const h = fs.readFileSync(file, "utf8");
  console.log("====", path.basename(file), h.length);
  const pats = [
    /alice\/[a-z0-9_\/]+/gi,
    /samantha\/[a-z0-9_\/]+/gi,
    /\/video\/[a-z0-9_\/]+/gi,
    /share[_/][a-z0-9_]+/gi,
    /get_[a-z0-9_]+/gi,
  ];
  const found = new Set();
  for (const p of pats) {
    for (const m of h.matchAll(p)) found.add(m[0]);
  }
  console.log(
    [...found]
      .filter((x) => /share|video|alice|resource|model|play/i.test(x))
      .slice(0, 80)
      .join("\n"),
  );
}

// also fetch page async chunk
const chunk =
  "https://www.doubao.com/static/js/async/video-sharing_page.994f886d.js";
const res = await fetch(chunk);
const js = await res.text();
fs.writeFileSync(path.join(os.tmpdir(), "vs-page.js"), js);
console.log("page chunk", js.length);
const found2 = new Set();
for (const m of js.matchAll(/alice\/[a-z0-9_\/]+/gi)) found2.add(m[0]);
for (const m of js.matchAll(/get_[a-z0-9_]+/gi)) found2.add(m[0]);
for (const m of js.matchAll(/fallback_api|get_video_model|share_id/gi))
  found2.add(m[0]);
console.log([...found2].slice(0, 60).join("\n"));
