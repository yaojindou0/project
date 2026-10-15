import type { AuthPlatform } from "./auth";

export const PASSPORT_CONFIG: Record<
  AuthPlatform,
  {
    origin: string;
    aid: string;
    loginPath: string;
    label: string;
    officialLoginUrl: string;
  }
> = {
  jimeng: {
    origin: "https://jimeng.jianying.com",
    aid: "513695",
    loginPath: "/ai-tool/login",
    label: "即梦",
    officialLoginUrl: "https://jimeng.jianying.com/ai-tool/login",
  },
  xyq: {
    origin: "https://xyq.jianying.com",
    aid: "513695",
    loginPath: "/",
    label: "小云雀",
    officialLoginUrl: "https://xyq.jianying.com/",
  },
  doubao: {
    origin: "https://www.doubao.com",
    aid: "497858",
    loginPath: "/",
    label: "豆包",
    officialLoginUrl: "https://www.doubao.com/",
  },
};

/** 已注册账号短信登录（非绑定/注册） */
export const SMS_LOGIN_TYPE = "24";
