# 镜叙安卓端

uni-app（Vue 3）客户端，功能与仓库根目录 PC 网页端（Next）对齐：分镜、角色、场景图 / 首帧 / 末帧、Seedance 视频、豆包续聊、账号接入。

## 与 PC 的接口关系

| 能力 | PC（Next） | 安卓 H5 开发 | 安卓 App |
|------|------------|--------------|----------|
| 分镜 / 补全 / 对话 / 生图 / 校验 | 同源 `/api/*`（服务端转豆包协议） | 同源 `/api/*`，vite **中间件**按 PC 方式转协议后打 `config.js` 线上地址 | `apiBaseUrl` + `/api/*` 或直连 `config.js` |
| 登录验证码 / 短信 / 视频 | Next 路由 | vite `http-proxy` 改写到 `config.js` | 同左 |
| 上游路径常量 | `UPSTREAM_PATHS` | 同名常量，经 `toLocalApiPath` | 同左 |

**不转发到电脑 Next / 3000。** 协议转换在 `proxy/*-upstream.mjs`，上游表在本目录 `config.js`（与 `public/config.js` 对齐，各自维护）。

## 使用

1. 本目录启动 H5：`npm run dev:h5`（`0.0.0.0:5173`）。
2. 浏览器打开 `http://localhost:5173/`。
3. 设置里粘贴豆包网页 session（分镜 / 补全 / 网页生图共用）；可选填方舟 Key 走 ark 生图。

```bash
cd jingxu-android
npm install
npm run dev:h5
npm run build:app-android
```
