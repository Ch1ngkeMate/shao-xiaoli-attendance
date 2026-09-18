/**
 * 个人主页「按月折叠」+ 任务详情「头像跳转」逻辑测试
 * 用 Node 直接加载小程序页面对象，注入假 wx / getApp / api。
 *
 * 运行：node scripts/test-profile-monthly.cjs
 */
const assert = require("assert");
const path = require("path");
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

// ---------------------------------------------------------------- 桩环境
const navCalls = [];
const toastCalls = [];

global.wx = {
  navigateTo: (o) => navCalls.push(o.url),
  showToast: (o) => toastCalls.push(o.title),
  request: () => {},
};
global.getApp = () => ({
  checkLogin: () => true,
  globalData: { user: { id: "me-1" }, token: "t", apiBase: "https://x" },
  hasRole: (...roles) => roles.includes("MEMBER"),
});

// 拦截 utils/api，避免真实请求
const apiStub = {
  getUserProfileMonths(userId, months) {
    apiStub.lastCall = { userId, months };
    return apiStub.nextResponse;
  },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.endsWith("utils/api") || request === "../../utils/api") {
    return "__api_stub__";
  }
  return origResolve.call(this, request, ...rest);
};
require.cache["__api_stub__"] = { id: "__api_stub__", filename: "__api_stub__", loaded: true, exports: apiStub };

// 加载页面对象（Page() 直接抓取配置）
let pageDef = null;
global.Page = (def) => { pageDef = def; };

const PROFILE = path.join(__dirname, "..", "miniprogram", "pages", "others", "profile.js");
const DETAIL = path.join(__dirname, "..", "miniprogram", "pages", "tasks", "detail.js");

/** 造一个可用的 page 实例：data 深拷贝 + setData 支持路径写法 */
function instantiate(def) {
  const inst = Object.assign({}, def);
  inst.data = JSON.parse(JSON.stringify(def.data || {}));
  inst.setData = function (patch) {
    Object.keys(patch).forEach((k) => {
      const m = k.match(/^([^.[]+)\[(\d+)\]\.(.+)$/); // monthGroups[2].expanded
      if (m) {
        inst.data[m[1]][Number(m[2])][m[3]] = patch[k];
      } else {
        inst.data[k] = patch[k];
      }
    });
  };
  return inst;
}

// ---------------------------------------------------------------- 测试数据
const NOW = new Date();
const ym = (offset) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const CUR = ym(0);
const PREV = ym(-1);

function monthRow(month, opts) {
  return Object.assign(
    {
      userId: "u-2",
      username: "chen",
      displayName: "陈劭宇",
      role: "MEMBER",
      claimCount: 3,
      submitCount: 2,
      approvedCount: 0,
      approvedPoints: 0,
      approvedTasks: [],
      meetingAbsences: [],
      otherPoints: 0,
      totalPoints: 0,
      month,
    },
    opts,
  );
}

const RESPONSE = {
  user: {
    id: "u-2",
    username: "chen",
    displayName: "陈劭宇",
    role: "MEMBER",
    avatarUrl: "/uploads/a.png",
    isActive: true,
  },
  row: monthRow(CUR, { approvedCount: 2, approvedPoints: 15, totalPoints: 15 }),
  monthly: [
    monthRow(CUR, {
      approvedCount: 2,
      approvedPoints: 15,
      totalPoints: 15,
      approvedTasks: [
        { taskId: "t-1", title: "图书馆整理", points: 10, reviewTime: "2026-09-10T02:00:00.000Z" },
        { taskId: "t-2", title: "迎新志愿", points: 5, reviewTime: "2026-09-05T02:00:00.000Z" },
      ],
    }),
    monthRow(PREV, {
      approvedCount: 1,
      approvedPoints: 8,
      otherPoints: -2,
      totalPoints: 6,
      approvedTasks: [
        { taskId: "t-3", title: "暑期社区义诊", points: 8, reviewTime: "2026-08-18T02:00:00.000Z" },
      ],
      meetingAbsences: [
        { id: "a-1", meetingId: "m-1", label: "2026-08-20 会议旷会（八月例会）", amount: -2, recordedAt: "2026-08-20T10:00:00.000Z" },
      ],
    }),
    // 完全空的月份 → 应被过滤掉（不显示空面板）
    monthRow(ym(-2)),
  ],
};

// ---------------------------------------------------------------- 用例
delete require.cache[require.resolve(PROFILE)];
pageDef = null;
require(PROFILE);
const profilePage = instantiate(pageDef);

check("profile.js 被 Page() 注册", () => assert.ok(profilePage, "pageDef 为空"));

check("onLoad 记录 userId 与当前月，且不自行发请求", () => {
  const realLoad = profilePage.loadProfile;
  let called = 0;
  profilePage.loadProfile = function () { called++; };
  navCalls.length = 0;
  apiStub.lastCall = undefined;
  profilePage.onLoad({ id: "u-2" });
  profilePage.loadProfile = realLoad; // 立刻还原，避免影响后续用例
  assert.strictEqual(apiStub.lastCall, undefined, "onLoad 不应直接发请求（由 loadProfile 负责）");
  assert.strictEqual(called, 1, "onLoad 应调用一次 loadProfile");
  assert.strictEqual(profilePage.userId, "u-2");
  assert.match(profilePage.data.currentMonth, /^\d{4}-\d{2}$/);
});

check("buildItems 把任务/旷会合并并按时间倒序", () => {
  const row = RESPONSE.monthly[1]; // 上月
  const items = profilePage.buildItems(row);
  assert.strictEqual(items.length, 2, `预期 2 条，实际 ${items.length}`);
  assert.strictEqual(items[0].type, "absence", "旷会时间更晚应排第一");
  assert.strictEqual(items[0].points, -2);
  assert.strictEqual(items[1].title, "暑期社区义诊");
  assert.strictEqual(items[1].points, 8);
});

check("buildItems 其它加减分：otherPoints 已含会议部分，不重复计入", () => {
  const row = RESPONSE.monthly[1];
  // otherPoints=-2，meetingAbsences 合计 -2 → otherOnly=0，不应额外生成 adjust 条目
  const items = profilePage.buildItems(row);
  assert.ok(!items.some((i) => i.type === "adjust"), "不应出现重复的「其它加减分」");
});

check("buildItems 非会议加减分会单独成一条", () => {
  const row = monthRow(CUR, { otherPoints: 5, totalPoints: 5 });
  const items = profilePage.buildItems(row);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, "adjust");
  assert.strictEqual(items[0].points, 5);
});

// ---- 完整 loadProfile（异步）
(async () => {
  apiStub.nextResponse = RESPONSE;
  await profilePage.loadProfile();

  check("loadProfile: 空月份被过滤，只剩 2 组", () => {
    assert.strictEqual(profilePage.data.monthGroups.length, 2, `实际 ${profilePage.data.monthGroups.length}`);
  });

  check("loadProfile: 月份标签为中文「YYYY年M月」", () => {
    const g0 = profilePage.data.monthGroups[0];
    const [y, m] = g0.month.split("-");
    assert.strictEqual(g0.label, `${y}年${Number(m)}月`);
  });

  check("loadProfile: 只有最近一组默认展开，其余折叠", () => {
    assert.strictEqual(profilePage.data.monthGroups[0].expanded, true);
    assert.strictEqual(profilePage.data.monthGroups[1].expanded, false);
  });

  check("loadProfile: 头像 URL 被补全为绝对地址", () => {
    assert.strictEqual(profilePage.data.profileUser.avatarUrl, "https://x/uploads/a.png");
  });

  check("loadProfile: hasAnyRecord=true", () => {
    assert.strictEqual(profilePage.data.hasAnyRecord, true);
  });

  check("onToggleMonth 展开折叠可来回切换", () => {
    const before = profilePage.data.monthGroups[1].expanded;
    profilePage.onToggleMonth({ currentTarget: { dataset: { index: 1 } } });
    assert.strictEqual(profilePage.data.monthGroups[1].expanded, !before);
    profilePage.onToggleMonth({ currentTarget: { dataset: { index: 1 } } });
    assert.strictEqual(profilePage.data.monthGroups[1].expanded, before);
  });

  check("onToggleMonth 非法 index 不报错", () => {
    profilePage.onToggleMonth({ currentTarget: { dataset: { index: "x" } } });
    profilePage.onToggleMonth({ currentTarget: { dataset: {} } });
  });

  check("onOpenTask 跳任务详情", () => {
    navCalls.length = 0;
    profilePage.onOpenTask({ currentTarget: { dataset: { taskId: "t-1" } } });
    assert.deepStrictEqual(navCalls, ["/pages/tasks/detail?id=t-1"]);
  });

  check("onOpenTask 无 taskId 时不跳转", () => {
    navCalls.length = 0;
    profilePage.onOpenTask({ currentTarget: { dataset: {} } });
    assert.strictEqual(navCalls.length, 0);
  });

  // ---- 任务详情页
  delete require.cache[require.resolve(DETAIL)];
  pageDef = null;
  require(DETAIL);
  const detailPage = instantiate(pageDef);

  check("detail.onOpenProfile 跳个人主页", () => {
    navCalls.length = 0;
    detailPage.onOpenProfile({ currentTarget: { dataset: { userId: "u-2" } } });
    assert.deepStrictEqual(navCalls, ["/pages/others/profile?id=u-2"]);
  });

  check("detail.onOpenProfile 点自己只提示不跳转", () => {
    navCalls.length = 0;
    toastCalls.length = 0;
    detailPage.onOpenProfile({ currentTarget: { dataset: { userId: "me-1" } } });
    assert.strictEqual(navCalls.length, 0, "不应跳转");
    assert.deepStrictEqual(toastCalls, ["这是你本人"]);
  });

  check("detail.onOpenProfile 无 userId 不报错不跳转", () => {
    navCalls.length = 0;
    detailPage.onOpenProfile({ currentTarget: { dataset: {} } });
    assert.strictEqual(navCalls.length, 0);
  });

  // ---- 空数据兜底
  apiStub.nextResponse = {
    user: { id: "u-9", displayName: "新人", role: "MEMBER", isActive: true, avatarUrl: "" },
    row: null,
    monthly: [],
  };
  await profilePage.loadProfile();
  check("loadProfile: 无任何记录时 hasAnyRecord=false 且不崩", () => {
    assert.strictEqual(profilePage.data.hasAnyRecord, false);
    assert.deepStrictEqual(profilePage.data.monthGroups, []);
    assert.strictEqual(profilePage.data.loadError, "");
  });

  // ---- 接口失败：不能伪装成「用户不存在」
  apiStub.getUserProfileMonths = () => Promise.reject(new Error("缺少或无效的 month（格式 YYYY-MM）"));
  toastCalls.length = 0;
  await profilePage.loadProfile();
  check("loadProfile: 接口 400 时进入错误态并保留原因", () => {
    assert.strictEqual(profilePage.data.loading, false);
    assert.strictEqual(profilePage.data.loadError, "缺少或无效的 month（格式 YYYY-MM）");
    assert.strictEqual(profilePage.data.profileUser, null, "不能残留旧用户，否则会误判为已加载");
  });
  check("loadProfile: 接口 400 会 toast 真实原因而非「用户不存在」", () => {
    assert.deepStrictEqual(toastCalls, ["缺少或无效的 month（格式 YYYY-MM）"]);
  });

  // ---- 接口返回 200 但没有 user 字段
  apiStub.getUserProfileMonths = () => Promise.resolve({ row: null, monthly: [] });
  await profilePage.loadProfile();
  check("loadProfile: 响应缺 user 字段时进入错误态", () => {
    assert.strictEqual(profilePage.data.loadError, "加载失败：接口返回异常");
    assert.strictEqual(profilePage.data.profileUser, null);
  });

  // ---- 重试
  apiStub.getUserProfileMonths = () => Promise.resolve(RESPONSE);
  profilePage.onRetry();
  await new Promise((r) => setTimeout(r, 0));
  check("onRetry: 清空错误并重新加载成功", () => {
    assert.strictEqual(profilePage.data.loadError, "");
    assert.strictEqual(profilePage.data.profileUser.displayName, "陈劭宇");
    assert.strictEqual(profilePage.data.monthGroups.length, 2);
  });

  console.log("\n=== 个人主页按月折叠 + 头像跳转 测试 ===\n");
  // 只打印最后一个模块的用例（profile 用例 + detail 用例已累积在 cases 内）
  console.log(cases.join("\n"));
  console.log(`\n共 ${cases.length} 项，失败 ${failures} 项\n`);
  process.exit(failures > 0 ? 1 : 0);
})();
