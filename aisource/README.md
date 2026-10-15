# 镜叙 JINGXU · AI 漫剧生成

默认**在线版**，走原线上接口（豆包 / 方舟 / passport）；演示 Mock 默认关闭。

额度可登录多个账号，工作室/设置里手动选定当前使用账号（不自动轮换）。豆包每个账号固定复用一个聊天窗；生成视频若需确认会自动回复「确定」，并从该对话取回视频。

## 静态站 jingxu-html

```bash
npm run pack:html
```

产物 `release/jingxu-html/`：`index.html` + `assets/` + `config.js`

```js
// 默认已直连原线上接口；仅当需要自建代理时填写：
window.__JINGXU_API_BASE__ = ""; // 或 "https://你的 jingxu-web"
```

## Node 网页包

```bash
npm run pack
```

## 开发

```bash
npm install && npm run dev
```
