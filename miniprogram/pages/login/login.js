const app = getApp();

/**
 * 把后端/微信返回的英文错误码翻译成可执行的提示。
 *
 * 真机上的「请求失败 (500)」绝大多数是 jscode2session 失败，后端会把微信的
 * errmsg 原样透传。但微信的英文原文对使用者毫无指导意义（比如 40163 只是
 * 说 code 被用过），所以在这里给出「下一步该做什么」。
 */
function friendlyError(message) {
  const msg = String(message || "");
  // 40029 / 40163 / 45011 都是 code 层面的问题，重试即可
  if (/40029|invalid code/i.test(msg)) return "微信登录凭证无效，请重新点击登录";
  if (/40163|code been used/i.test(msg)) return "登录凭证已被使用，请稍等一秒后重新点击";
  if (/45011|api minute-quota/i.test(msg)) return "请求过于频繁，请稍后再试";
  if (/40013|invalid appid/i.test(msg)) return "小程序 AppID 与服务端配置不一致，请联系管理员";
  if (/40125|invalid appsecret/i.test(msg)) return "服务端微信密钥配置有误，请联系管理员";
  if (/未配置微信小程序/i.test(msg)) return "服务端尚未配置微信密钥，请联系管理员";
  if (/请求失败 \(500\)/.test(msg)) return "服务端登录接口异常，请稍后重试或联系管理员";
  if (/request:fail|网络/i.test(msg)) return "网络异常，请检查网络后重试";
  return msg || "操作失败，请重试";
}

Page({
  data: {
    realName: "",
    loading: false,
    logoUrl: "/assets/dept-logo.png",
    logoFailed: false,
    showForm: false,
    /** 登录/绑定失败原因，非空时在表单里显示（toast 会截断长文案） */
    errMsg: "",
  },

  onLoad() {
    // 已有 token 则自动登录，不展示表单
    const token = wx.getStorageSync("sxl_token");
    if (token) {
      app.globalData.token = token;
      app.globalData.user = wx.getStorageSync("sxl_user");
      this.onWxLogin();
    } else {
      this.setData({ showForm: true });
    }
  },

  onLogoError() {
    this.setData({ logoFailed: true });
  },

  onNameInput(e) {
    // 用户开始改名字时，上一次的报错就过期了
    this.setData({ realName: e.detail.value, errMsg: "" });
  },

  /**
   * wx.login 的 Promise 用法在当前基础库上稳定；
   * 但若用户之前点过、code 已被消费，微信会返回 errcode 40163，
   * 这时必须重新取一个 code，而不是拿旧的重试。
   */
  fetchWxCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        success(res) {
          if (res && res.code) resolve(res.code);
          else reject(new Error("微信登录失败，请重试"));
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || "微信登录失败，请重试"));
        },
      });
    });
  },

  async onBind() {
    if (this.data.loading) return; // 防连点：重复用同一个 code 必然 40163
    const realName = this.data.realName.trim();
    if (!realName) {
      wx.showToast({ title: "请输入真实姓名", icon: "none" });
      return;
    }
    this.setData({ loading: true, errMsg: "" });
    try {
      const code = await this.fetchWxCode();
      const api = require("../../utils/api");
      const result = await api.bindLogin(code, realName);
      app.setSession(result.token, result.user);
      app.openStartPage();
    } catch (err) {
      const text = friendlyError(err && err.message);
      this.setData({ loading: false, errMsg: text });
      wx.showToast({ title: text, icon: "none" });
    }
  },

  async onWxLogin() {
    if (this.data.loading) return; // 防连点
    this.setData({ loading: true, errMsg: "" });
    try {
      const code = await this.fetchWxCode();
      const api = require("../../utils/api");
      const result = await api.wxLogin(code);
      app.setSession(result.token, result.user);
      app.openStartPage();
    } catch (err) {
      const text = friendlyError(err && err.message);
      this.setData({ loading: false });
      wx.showToast({ title: text, icon: "none" });
      // 自动登录失败（如后台解绑了 openid），清除旧凭据并展示表单
      app.clearSession();
      this.setData({ showForm: true, realName: "", errMsg: text });
    }
  },
});
