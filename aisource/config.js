/**
 * 镜叙静态站 · 默认在线版，全部使用原线上接口
 *
 * - 默认直连：豆包 www.doubao.com / 方舟 ark.cn-beijing.volces.com / passport
 * - 若填写 __JINGXU_API_BASE__（自建 jingxu-web），则改走该根 + 上游原路径
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
    enrich: "https://chatcompletion.1666976842.workers.dev/",
    chatReply: "https://chatcompletion.1666976842.workers.dev/",
    image: "https://imagesgenerations.1666976842.workers.dev/",
    video: "https://chatcompletion2.1666976842.workers.dev/",
    videoArk: "https://generationstasks.1666976842.workers.dev/",
    authSendCode: "https://sendcode.1666976842.workers.dev/",
    authLogin: "https://smslogin.1666976842.workers.dev/",
    authCheckSession: "https://doubao-proxy.1666976842.workers.dev/",
    mediaBase: base || DOUBAO,
  };
})();
