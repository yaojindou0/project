/**
 * 打包：HTML + assets + config.js（上游原路径，对齐 /api 所代理地址）
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release", "jingxu-html");

console.log("[pack:html] vite build…");
const build = spawnSync(
  "npx",
  ["vite", "build", "--config", "vite.config.ts"],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_STATIC_HTML: "1",
    },
  },
);
if (build.status !== 0) {
  console.error("[pack:html] build failed");
  process.exit(build.status || 1);
}

const publicConfig = join(root, "public", "config.js");
const outConfig = join(outDir, "config.js");
if (existsSync(publicConfig)) {
  copyFileSync(publicConfig, outConfig);
}

writeFileSync(
  join(outDir, "请读我.txt"),
  [
    "镜叙静态站 · 默认在线版 · 原线上接口",
    "====================================",
    "",
    "默认已直连：",
    "  https://www.doubao.com/samantha/chat/completion",
    "  https://www.doubao.com/chat/completion",
    "  https://ark.cn-beijing.volces.com/api/v3/images/generations",
    "  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "  https://www.doubao.com/passport/web/send_code/",
    "  https://www.doubao.com/passport/web/sms_login/",
    "  https://www.doubao.com/passport/account/info/v2/",
    "",
    "可选：若浏览器跨域受限，部署 jingxu-web 后在 config.js 填写：",
    '  window.__JINGXU_API_BASE__ = "https://你的域名";',
    "  （将改走自建根 + 同名上游原路径）",
    "",
    "设置里「离线演示 Mock」默认关闭。",
    "",
  ].join("\n"),
  "utf8",
);

console.log("[pack:html] done →", outDir);
