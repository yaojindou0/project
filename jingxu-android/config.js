/**
 * 镜叙安卓端线上代理表（与仓库 public/config.js 保持一致，两边各自文件各自维护）。
 *
 * - 默认直连：豆包 www.doubao.com / 方舟 ark.cn-beijing.volces.com / passport
 * - 若填写 __JINGXU_API_BASE__（自建 jingxu-web），则改走该根 + 上游原路径
 * - H5 开发：浏览器打同源路径，由本目录 vite 按本表重新代理（不经过电脑 Next / 3000）
 */
window.__JINGXU_API_BASE__ = "";

(function () {
  var base = String(window.__JINGXU_API_BASE__ || "").replace(/\/+$/, "");
  var DOUBAO = "https://www.doubao.com";
  var ARK = "https://ark.cn-beijing.volces.com";

  function online(origin, path) {
    return base ? base + path : origin + path;
  }

  window.__JINGXU_ENDPOINTS__ = {
    script: online(DOUBAO, "/samantha/chat/completion"),
    // 直连线上时与 script 同接口；自建代理时用可区分路径
    enrich: base
      ? base + "/samantha/chat/enrich"
      : DOUBAO + "/samantha/chat/completion",
    chatReply: base
      ? base + "/samantha/chat/reply"
      : DOUBAO + "/samantha/chat/completion",
    image: online(ARK, "/api/v3/images/generations"),
    video: online(DOUBAO, "/chat/completion"),
    videoArk: online(ARK, "/api/v3/contents/generations/tasks"),
    authSendCode: online(DOUBAO, "/passport/web/send_code/"),
    authLogin: online(DOUBAO, "/passport/web/sms_login/"),
    authCheckSession: online(DOUBAO, "/passport/account/info/v2/"),
    mediaBase: base || DOUBAO,
  };
})();
