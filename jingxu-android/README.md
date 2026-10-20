# 镜叙安卓端

uni-app（Vue 3）客户端，功能与仓库根目录 PC 网页端（Next）对齐：分镜、角色、场景图 / 首帧 / 末帧、Seedance 视频、豆包续聊、账号接入。

## 与 PC 的接口关系

| 能力 | PC（Next） | 安卓 H5 开发 | 安卓 App |
|------|------------|--------------|----------|
| 分镜 / 补全 / 对话 / 生图 / 视频 / 校验 / 截尾帧 | 同源 `/api/*`（服务端转豆包协议） | 同源 `/api/*`，vite **中间件**按 PC 方式转协议后打线上地址 | `apiBaseUrl` + `/api/*` 或直连 `config.js` |
| 短信发码 / 登录 | Next passport | 暂提示改用「粘贴 session」 | 同左 |
| 上游路径常量 | `UPSTREAM_PATHS` | 同名常量，经 `toLocalApiPath` | 同左 |

**不转发到电脑 Next / 3000。** 协议转换在 `proxy/*-upstream.mjs`，上游表在本目录 `config.js`（与 `public/config.js` 对齐，各自维护）。

## 使用

1. 本目录启动 H5：`npm run dev:h5`（`0.0.0.0:5173`）。
2. 浏览器打开 `http://localhost:5173/`（默认进**项目**页）。
3. 项目可新建 / 导入 / 导出 / 删除；点项目带缓存进创作台。完整项目包含故事、角色、分镜与媒体。当前缓存默认绑定「仙帝重生」。
4. 设置里粘贴豆包网页 session（分镜 / 补全 / 生图 / 视频共用）；可选填方舟 Key。

```bash
cd jingxu-android
npm install
npm run dev:h5
npm run build:app-android
```
