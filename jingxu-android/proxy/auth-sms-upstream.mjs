/**
 * 短信发码 / 登录：安卓侧提示用粘贴 session（完整 passport 协议较重，与 PC 共用逻辑成本高）。
 * 避免把创作台 JSON 裸打到 passport 导致莫名 4xx。
 */

export async function runAuthSendCodeUpstream() {
  const err = new Error(
    "安卓端请用「粘贴豆包网页 session」登录。短信发码请在电脑端设置页完成，或之后再接入完整 passport。",
  );
  err.status = 501;
  throw err;
}

export async function runAuthLoginUpstream() {
  const err = new Error(
    "安卓端请用「粘贴豆包网页 session」登录。短信登录请在电脑端设置页完成。",
  );
  err.status = 501;
  throw err;
}
