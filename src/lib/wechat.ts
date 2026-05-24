/** 微信小程序 jscode2session */

export interface WxSessionResult {
  openid: string;
  session_key: string;
  unionid?: string;
}

export function getWxCredentials(): { appid: string; secret: string } | null {
  const appid = process.env.WX_APPID?.trim();
  const secret = process.env.WX_SECRET?.trim();
  if (!appid || !secret) return null;
  return { appid, secret };
}

export async function code2session(code: string): Promise<WxSessionResult> {
  const cred = getWxCredentials();
  if (!cred) {
    throw new Error("服务端未配置微信小程序 AppID / Secret");
  }

  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${cred.appid}&secret=${cred.secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    openid?: string;
    session_key?: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (!res.ok || data.errcode) {
    throw new Error(
      `微信接口返回错误: ${data.errmsg ?? JSON.stringify(data)} (errcode: ${data.errcode ?? "unknown"})`,
    );
  }

  if (!data.openid) {
    throw new Error("微信接口未返回 openid");
  }

  return {
    openid: data.openid,
    session_key: data.session_key ?? "",
    unionid: data.unionid,
  };
}
