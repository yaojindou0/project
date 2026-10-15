/**
 * 组装 release/jingxu-web（不重新 build）
 * 用法：npm run pack:assemble
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { platform } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");
const outDir = join(root, "release", "jingxu-web");

function copyTree(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  if (platform() === "win32") {
    const r = spawnSync(
      "robocopy",
      [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
      { stdio: "inherit", shell: true },
    );
    // robocopy: 0–7 成功，>=8 失败
    if ((r.status ?? 0) >= 8) {
      throw new Error(`robocopy failed: ${src} → ${dest} (code ${r.status})`);
    }
    return;
  }
  cpSync(src, dest, { recursive: true });
}

if (!existsSync(join(standalone, "server.js"))) {
  console.error(
    "[assemble] missing .next/standalone/server.js，请先 npm run build",
  );
  process.exit(1);
}

console.log("[assemble] cleaning", outDir);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

console.log("[assemble] copy standalone…");
copyTree(standalone, outDir);

console.log("[assemble] copy static…");
copyTree(staticDir, join(outDir, ".next", "static"));

if (existsSync(publicDir)) {
  console.log("[assemble] copy public…");
  copyTree(publicDir, join(outDir, "public"));
}

writeFileSync(
  join(outDir, "start.bat"),
  [
    "@echo off",
    'cd /d "%~dp0"',
    "set PORT=3000",
    "set HOSTNAME=0.0.0.0",
    "echo.",
    "echo  镜叙网页版: http://localhost:%PORT%",
    "echo  局域网: http://本机IP:%PORT%",
    "echo  按 Ctrl+C 停止",
    "echo.",
    "node server.js",
    "pause",
    "",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  join(outDir, "start.sh"),
  [
    "#!/usr/bin/env bash",
    'cd "$(dirname "$0")"',
    'export PORT="${PORT:-3000}"',
    'export HOSTNAME="${HOSTNAME:-0.0.0.0}"',
    "echo",
    'echo " 镜叙网页版: http://localhost:$PORT"',
    "echo",
    "exec node server.js",
    "",
  ].join("\n"),
  "utf8",
);

writeFileSync(
  join(outDir, "README.txt"),
  [
    "镜叙 JINGXU · 网页包（可直接上线）",
    "================================",
    "",
    "本目录含完整网页服务（前端 + 豆包/方舟接口）。",
    "无需配置即梦/小云雀本地代理。",
    "",
    "【本机】",
    "  Windows: 双击 start.bat",
    "  Mac/Linux: bash start.sh",
    "  或: node server.js",
    "",
    "默认: http://localhost:3000",
    "",
    "【上线】",
    "  1. 上传整个 jingxu-web 到 Node.js 18+ 服务器",
    "  2. 运行 node server.js",
    "  3. 浏览器访问域名或 IP:端口",
    "",
    "可选环境变量: PORT / HOSTNAME",
    "",
  ].join("\n"),
  "utf8",
);

console.log("[assemble] done →", outDir);
console.log("[assemble] server.js =", existsSync(join(outDir, "server.js")));
console.log(
  "[assemble] static =",
  existsSync(join(outDir, ".next", "static")),
);
