/**
 * 将 Next.js standalone 产物打成可直接上线的网页包（release/jingxu-web）
 * 用法：npm run pack
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

console.log("[pack] building…");
const build = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
if (build.status !== 0) {
  console.error("[pack] build failed");
  process.exit(build.status || 1);
}

console.log("[pack] assembling release…");
const assemble = spawnSync(
  process.execPath,
  [join(root, "scripts", "assemble-release.mjs")],
  { cwd: root, stdio: "inherit", env: process.env },
);
if (assemble.status !== 0) {
  console.error("[pack] assemble failed");
  process.exit(assemble.status || 1);
}

console.log("[pack] 上传 release/jingxu-web 后执行 node server.js 即可访问");
