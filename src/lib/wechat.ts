/** 微信小程序 jscode2session + 订阅消息 access_token 管理 */

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

/* ========== Access Token 缓存（全局单例，7200 秒有效期） ========== */

let cachedToken: { token: string; expiresAt: number } | null = null;

/** 获取微信 access_token，自动缓存并在过期前 5 分钟刷新 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const cred = getWxCredentials();
  if (!cred) {
    throw new Error("服务端未配置微信小程序 AppID / Secret");
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${cred.appid}&secret=${cred.secret}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode || !data.access_token) {
    throw new Error(
      `获取 access_token 失败: ${data.errmsg ?? JSON.stringify(data)} (errcode: ${data.errcode ?? "unknown"})`,
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  return cachedToken.token;
}

/* ========== jscode2session ========== */

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
