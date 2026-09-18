/**
 * 图片路径补全（fixUrl）与登录页错误处理 回归测试
 *
 * 背景：
 *  1. 后端本地上传返回 `/uploads/avatar/xxx.png` 相对路径，小程序必须补成完整
 *     https 地址。旧 fixUrl 只读 `app.globalData.apiBase`，一旦 getApp() 不可用或
 *     该字段缺失，base 会静默变成 ''，所有头像/图片白屏且不报错。
 *  2. 登录页「请求失败 (500)」把微信的英文 errmsg 原样弹 toast，使用者无从下手，
 *     且按钮未禁用可连点（重复使用 code 必然触发 40163）。
 *
 * 运行：node scripts/test-fixurl-and-login.cjs
 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const Module = require("module");

let failures = 0;
const cases = [];

function check(name, fn) {
  try {
    fn();
    cases.push(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    cases.push(`  FAIL  ${name}\n        ${e.message}`);
  }
}

const MG = path.join(__dirname, "..", "miniprogram");
const CONFIG = require(path.join(MG, "utils", "config.js"));
const REAL_BASE = CONFIG.getApiBase();

// ============================================================ 一、fixUrl

/** 清掉 require 缓存，让 format.js 重新求值（它会 require ./config） */
function freshFormat() {
  delete require.cache[require.resolve(path.join(MG, "utils", "format.js"))];
  return require(path.join(MG, "utils", "format.js"));
}

check("config.API_BASE 是 https 且末尾无斜杠", () => {
  assert.ok(REAL_BASE.startsWith("https://"), `实际: ${REAL_BASE}`);
  assert.ok(!REAL_BASE.endsWith("/"), `实际: ${REAL_BASE}`);
});

check("fixUrl: 相对路径 + app.globalData.apiBase 正常时补全", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl("/uploads/avatar/a.png"), "https://shaoxiaoli.top/uploads/avatar/a.png");
});

check("fixUrl: 不以 / 开头的相对路径也会补上斜杠", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl("uploads/a.png"), "https://shaoxiaoli.top/uploads/a.png");
});

check("fixUrl: 已是 http(s) 的 URL 原样返回（Vercel Blob 场景）", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  const abs = "https://xxx.public.blob.vercel-storage.com/a.png";
  assert.strictEqual(fixUrl(abs), abs);
});

check("fixUrl: 空值原样返回，不产生 'https://...undefined'", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl(""), "");
  assert.strictEqual(fixUrl(null), null);
  assert.strictEqual(fixUrl(undefined), undefined);
});

// —— 这几个是本次修复的核心：旧实现全部会产出 '/uploads/xxx' 这种死链 ——

check("【修复】fixUrl: getApp() 抛异常时回落到 config，不产生死链", () => {
  global.getApp = () => { throw new Error("getApp is not defined"); };
  const { fixUrl } = freshFormat();
  const out = fixUrl("/uploads/avatar/a.png");
  assert.strictEqual(out, `${REAL_BASE}/uploads/avatar/a.png`);
  assert.ok(out.startsWith("https://"), `必须补成绝对地址，实际: ${out}`);
});

check("【修复】fixUrl: getApp() 返回空对象时回落到 config", () => {
  global.getApp = () => ({});
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl("/uploads/a.png"), `${REAL_BASE}/uploads/a.png`);
});

check("【修复】fixUrl: globalData 缺 apiBase 字段时回落到 config", () => {
  global.getApp = () => ({ globalData: {} });
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl("/uploads/a.png"), `${REAL_BASE}/uploads/a.png`);
});

check("【修复】fixUrl: apiBase 为空串时回落到 config", () => {
  global.getApp = () => ({ globalData: { apiBase: "" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(fixUrl("/uploads/a.png"), `${REAL_BASE}/uploads/a.png`);
});

check("fixUrl: 头像与背景图两类路径都能补全", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(
    fixUrl("/uploads/avatar/11111111-2222-3333-4444-555555555555.png"),
    "https://shaoxiaoli.top/uploads/avatar/11111111-2222-3333-4444-555555555555.png",
  );
  assert.strictEqual(fixUrl("/uploads/task/x.jpg"), "https://shaoxiaoli.top/uploads/task/x.jpg");
});

check("fixUrl: 成果档案的三级路径 /uploads/outcomes/image/x.png 补全正确", () => {
  global.getApp = () => ({ globalData: { apiBase: "https://shaoxiaoli.top" } });
  const { fixUrl } = freshFormat();
  assert.strictEqual(
    fixUrl("/uploads/outcomes/image/x.png"),
    "https://shaoxiaoli.top/uploads/outcomes/image/x.png",
  );
});

// ============================================================ 二、源码静态检查（防回归）

check("所有页面都统一用 fixUrl，不再手写 base 拼接", () => {
  const files = [
    "pages/settings/settings.js",
    "pages/profile/profile.js",
    "pages/tasks/detail.js",
    "pages/tasks/tasks.js",
    "pages/others/profile.js",
    "pages/announcements/detail.js",
  ];
  const bad = [];
  files.forEach((rel) => {
    const src = fs.readFileSync(path.join(MG, rel), "utf8");
    // 允许 require fixUrl，但不允许自己写 `startsWith('http') ? : base + ...` 这类拼装
    if (/const\s+base\s*=\s*app\.globalData\.apiBase/.test(src)) bad.push(`${rel} 手写了 base`);
    src.split(/\r?\n/).forEach((ln, i) => {
      if (/startsWith\(['"]http['"]\)\s*\?/.test(ln) && !/fixUrl/.test(ln)) {
        bad.push(`${rel}:${i + 1} 手写了 URL 拼接`);
      }
    });
  });
  assert.deepStrictEqual(bad, [], `以下位置应改用 fixUrl：\n        ${bad.join("\n        ")}`);
});

/** 从 `anchor` 起，按括号配平截取一段代码（正则的 [\s\S]*? 会在第一个 `})` 就截断） */
function sliceBlock(src, anchor) {
  const start = src.indexOf(anchor);
  if (start < 0) return null;
  let depth = 0;
  let seen = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "{") { depth++; seen = true; }
    else if (ch === ")" || ch === "}") {
      depth--;
      if (seen && depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

check("提交审核列表的用户头像被补全（管理员视图）", () => {
  const src = fs.readFileSync(path.join(MG, "pages/tasks/detail.js"), "utf8");
  const block = sliceBlock(src, "submissionsForReview.forEach(");
  assert.ok(block, "未找到 submissionsForReview 的补全代码块");
  assert.ok(/s\.user\.avatarUrl\s*=\s*fixUrl/.test(block), "提交审核列表缺少头像补全");
});

check("已接取人员列表的用户头像被补全", () => {
  const src = fs.readFileSync(path.join(MG, "pages/tasks/detail.js"), "utf8");
  assert.ok(
    /task\.claims\.forEach\([\s\S]{0,200}c\.user\.avatarUrl\s*=\s*fixUrl/.test(src),
    "task.claims 缺少头像补全",
  );
});

check("fixUrl 自身不再只依赖 getApp（含 config 兜底）", () => {
  const src = fs.readFileSync(path.join(MG, "utils/format.js"), "utf8");
  assert.ok(/require\(["']\.\/config["']\)/.test(src), "format.js 未引用 config 作为兜底");
  assert.ok(/try\s*\{[\s\S]*getApp\(\)[\s\S]*\}\s*catch/.test(src), "getApp() 未包在 try/catch 中");
});

// ============================================================ 三、登录页

const navCalls = [];
const toastCalls = [];
let pageDef = null;
let loginBehavior = { mode: "ok" };

const apiStub = {
  wxLogin() {
    apiStub.lastWxLogin = true;
    if (loginBehavior.mode === "fail") return Promise.reject(new Error(loginBehavior.message));
    return Promise.resolve({ token: "T", user: { id: "u1" } });
  },
  bindLogin(code, realName) {
    apiStub.lastBind = { code, realName };
    if (loginBehavior.mode === "fail") return Promise.reject(new Error(loginBehavior.message));
    return Promise.resolve({ token: "T", user: { id: "u1" } });
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.endsWith("utils/api") || request === "../../utils/api") return "__api_stub2__";
  return origResolve.call(this, request, ...rest);
};
require.cache["__api_stub2__"] = {
  id: "__api_stub2__", filename: "__api_stub2__", loaded: true, exports: apiStub,
};

let appSession = null;
let clearCount = 0;
let wxLoginCalls = 0;
global.wx = {
  login: (o) => {
    wxLoginCalls++;
    if (loginBehavior.wxFail) { o.fail({ errMsg: "login:fail mock" }); return; }
    o.success({ code: `CODE-${wxLoginCalls}` });
  },
  showToast: (o) => toastCalls.push(o.title),
  getStorageSync: () => "",
  setStorageSync: () => {},
  removeStorageSync: () => {},
  switchTab: (o) => navCalls.push(o.url),
  reLaunch: (o) => navCalls.push(o.url),
  setTabBarBadge: () => {},
  removeTabBarBadge: () => {},
  navigateTo: (o) => navCalls.push(o.url),
};
global.getApp = () => ({
  globalData: { apiBase: REAL_BASE, token: "", user: null },
  checkLogin: () => true,
  hasRole: () => false,
  setSession: (t, u) => { appSession = { t, u }; },
  clearSession: () => { clearCount++; },
  openStartPage: () => navCalls.push("__start__"),
  getStartPage: () => "tasks",
  setStartPage: (p) => p,
});
global.Page = (def) => { pageDef = def; };

delete require.cache[require.resolve(path.join(MG, "pages", "login", "login.js"))];
require(path.join(MG, "pages", "login", "login.js"));

function instantiate(def) {
  const inst = Object.assign({}, def);
  inst.data = JSON.parse(JSON.stringify(def.data || {}));
  inst.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      inst.data[k] = patch[k];
    });
  };
  return inst;
}

const loginPage = instantiate(pageDef);

check("login.js 注册成功且初始化 errMsg 为空", () => {
  assert.ok(pageDef, "login.js 未被 Page() 注册");
  assert.strictEqual(loginPage.data.errMsg, "");
});

check("login.onNameInput 会清掉上一次的报错", () => {
  loginPage.setData({ errMsg: "旧错误" });
  loginPage.onNameInput({ detail: { value: "许何禹帆" } });
  assert.strictEqual(loginPage.data.errMsg, "");
  assert.strictEqual(loginPage.data.realName, "许何禹帆");
});

check("login.onBind: 姓名为空时提示且不发请求", async () => {
  loginPage.setData({ realName: "   " });
  await loginPage.onBind();
  assert.ok(toastCalls.includes("请输入真实姓名"), "未提示请输入真实姓名");
  assert.strictEqual(apiStub.lastBind, undefined, "空姓名不应调用接口");
});

(async () => {
  // —— 500 错误的友好化 ——
  toastCalls.length = 0;

  loginBehavior = { mode: "fail", message: "request:fail 微信接口返回错误: invalid code (errcode: 40029)" };
  loginPage.setData({ realName: "许何禹帆", errMsg: "" });
  await loginPage.onBind();
  check("onBind: 40029 翻译为「凭证无效，请重新点击」", () => {
    assert.ok(
      loginPage.data.errMsg.includes("重新点击"),
      `实际: ${loginPage.data.errMsg}`,
    );
  });
  check("onBind: 失败后 loading 复位（按钮可再点）", () => {
    assert.strictEqual(loginPage.data.loading, false);
  });

  loginBehavior = { mode: "fail", message: "request:fail 微信接口返回错误: code been used (errcode: 40163)" };
  await loginPage.onBind();
  check("onBind: 40163 提示稍后重试，而不是甩英文码", () => {
    assert.ok(loginPage.data.errMsg.includes("已被使用"), `实际: ${loginPage.data.errMsg}`);
  });

  loginBehavior = { mode: "fail", message: "请求失败 (500)" };
  await loginPage.onBind();
  check("onBind: 裸 500 也会给出可执行提示", () => {
    assert.ok(loginPage.data.errMsg.includes("服务端登录接口异常"), `实际: ${loginPage.data.errMsg}`);
    assert.ok(!/^\d+$/.test(loginPage.data.errMsg));
  });

  loginBehavior = { mode: "fail", message: "服务端未配置微信小程序 AppID / Secret" };
  await loginPage.onBind();
  check("onBind: 服务端缺 WX 配置时指向管理员", () => {
    assert.ok(loginPage.data.errMsg.includes("管理员"), `实际: ${loginPage.data.errMsg}`);
  });

  // —— 成功路径 ——
  appSession = null;
  navCalls.length = 0;
  loginBehavior = { mode: "ok" };
  loginPage.setData({ realName: "许何禹帆", errMsg: "残留错误" });
  await loginPage.onBind();
  check("onBind: 成功后写入 session 并跳起始页", () => {
    assert.ok(appSession && appSession.t === "T", "未写入 session");
    assert.ok(navCalls.includes("__start__"), "未调用 openStartPage");
  });
  check("onBind: 成功后清空 errMsg", () => {
    assert.strictEqual(loginPage.data.errMsg, "");
  });

  // —— 防连点：重复点击不应再取第二个 code 去撞 40163 ——
  const before = wxLoginCalls;
  loginBehavior = { mode: "ok" };
  loginPage.setData({ loading: true }); // 模拟请求进行中
  await loginPage.onBind();
  check("onBind: loading 期间重复点击直接返回，不再发请求", () => {
    assert.strictEqual(wxLoginCalls, before, "重复点击又取了新 code");
  });
  loginPage.setData({ loading: false });

  // —— 自动登录失败要清 session 并露出表单 ——
  clearCount = 0;
  loginBehavior = { mode: "fail", message: "request:fail 微信接口返回错误: invalid appid (errcode: 40013)" };
  loginPage.setData({ showForm: false, realName: "" });
  await loginPage.onWxLogin();
  check("onWxLogin: 失败后清 session 且展示表单", () => {
    assert.ok(clearCount > 0, "未清 session");
    assert.strictEqual(loginPage.data.showForm, true);
  });
  check("onWxLogin: 失败原因挂到表单里可见", () => {
    assert.ok(loginPage.data.errMsg.length > 0, "errMsg 为空");
    assert.ok(loginPage.data.errMsg.includes("AppID"), `实际: ${loginPage.data.errMsg}`);
  });

  // —— wx.login 本身失败 ——
  loginBehavior = { mode: "ok", wxFail: true };
  loginPage.setData({ showForm: true, realName: "许何禹帆", loading: false });
  await loginPage.onBind();
  check("onBind: wx.login 失败时给出提示且不死锁", () => {
    assert.strictEqual(loginPage.data.loading, false);
    assert.ok(loginPage.data.errMsg.length > 0);
  });

  console.log("\n=== fixUrl 路径补全 + 登录错误处理 测试 ===\n");
  console.log(cases.join("\n"));
  console.log(`\n共 ${cases.length} 项，失败 ${failures} 项`);
  process.exit(failures > 0 ? 1 : 0);
})();
