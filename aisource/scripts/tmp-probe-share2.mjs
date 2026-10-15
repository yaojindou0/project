import fs from "fs";
import path from "path";
import os from "os";

const file = path.join(os.tmpdir(), "doubao-share.html");
const h = fs.readFileSync(file, "utf8");

// collect static js assets for video-sharing route
const m = h.match(/window\._MODERNJS_ROUTE_MANIFEST\s*=\s*(\{[\s\S]*?\});/);
if (!m) {
  console.log("no manifest");
  process.exit(1);
}
let manifest;
try {
  manifest = JSON.parse(m[1]);
} catch (e) {
  // try eval-ish fix trailing
  console.log("parse fail", e.message, m[1].slice(0, 200));
  process.exit(1);
}
const route = manifest.routeAssets?.["video-sharing"];
console.log("assets", route?.assets?.slice?.(0, 40));
const js = (route?.assets || []).filter((a) => /video-sharing|share/i.test(a));
console.log("named", js);

// also find any absolute static urls
const staticUrls = [
  ...h.matchAll(/https?:\/\/[^"'\\\s]+static\/js\/[^"'\\\s]+/g),
].map((x) => x[0]);
console.log("static abs", staticUrls.slice(0, 10));

const relative = [...h.matchAll(/"static\/js\/[^"]+"/g)].map((x) =>
  x[0].slice(1, -1),
);
console.log(
  "relative video-ish",
  relative.filter((x) => /video|share/i.test(x)).slice(0, 20),
);
console.log("relative count", relative.length);
