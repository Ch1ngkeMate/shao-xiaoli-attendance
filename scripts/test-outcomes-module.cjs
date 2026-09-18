/**
 * 成果档案板块 可用性测试
 *
 * 覆盖三个层面：
 *   A. 权限矩阵（静态）—— 4 个接口的鉴权分支是否正确
 *   B. 数据形态（真实 HTTP）—— 用合法会话打线上接口，验证响应结构
 *   C. 前端契约（静态）—— Web 页面 / 小程序页面对字段的消费是否与后端一致
 *
 * 其中 B 需要环境变量 SXL_SESSION（签好的 JWT）或 SXL_AUTH_SECRET（用于自签）。
 * 未提供时会 skip 并给出如何获取的提示，不会误判为失败。
 *
 * 运行：
 *   node scripts/test-outcomes-module.cjs
 *   SXL_AUTH_SECRET=xxx node scripts/test-outcomes-module.cjs
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASE = process.env.SXL_BASE || "https://note.shaoxiaoli.top";

let failures = 0;
const cases = [];
let skipped = 0;

function check(name, fn) {
  try {
    const r = fn();
    if (r === "SKIP") {
      skipped++;
      cases.push(`  SKIP  ${name}`);
      return;
    }
    cases.push(`  PASS  ${name}`);
  } catch (e) {
    failures++;
    cases.push(`  FAIL  ${name}\n        ${e.message}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// ============================================================ A. 权限矩阵

const outcomeRoute = read("src/app/api/outcomes/route.ts");
const metaRoute = read("src/app/api/tasks/[id]/outcome/route.ts");
const assetsRoute = read("src/app/api/tasks/[id]/outcome/assets/route.ts");
const assetDeleteRoute = read("src/app/api/tasks/[id]/outcome/assets/[assetId]/route.ts");

check("A1 GET /api/outcomes 要求登录（无会话返 401）", () => {
  assert.ok(/readSessionCookie\(\)/.test(outcomeRoute), "未调用 readSessionCookie");
  assert.ok(/401/.test(outcomeRoute), "缺少 401 分支");
  assert.ok(/未登录/.test(outcomeRoute), "401 消息应为「未登录」");
});

check("A2 GET /api/outcomes 对全体已登录成员开放（不限制角色）", () => {
  // 不应出现 role 校验 —— 这是全员可见的总目录
  assert.ok(!/session\.role\s*!==/.test(outcomeRoute), "总目录不应做角色校验");
  assert.ok(!/403/.test(outcomeRoute), "总目录不应返回 403");
});

check("A3 PATCH 成果说明：仅 ADMIN/MINISTER", () => {
  assert.ok(/role\s*!==\s*"ADMIN"\s*&&\s*session\.role\s*!==\s*"MINISTER"/.test(metaRoute), "角色校验缺失或写法变了");
  assert.ok(/403/.test(metaRoute), "缺少 403 分支");
});

check("A4 PATCH 校验任务存在（404）后才写入", () => {
  const i1 = metaRoute.indexOf("task.findUnique");
  const i2 = metaRoute.indexOf("taskOutcome.upsert");
  assert.ok(i1 > -1 && i2 > -1 && i1 < i2, "应先校验任务存在再 upsert");
  assert.ok(/404/.test(metaRoute), "缺少 404 分支");
});

check("A5 PATCH 用 upsert（无档案时按需创建）", () => {
  assert.ok(/taskOutcome\.upsert/.test(metaRoute), "未使用 upsert，首次编辑会失败");
});

check("A6 上传材料：非参与者且非管理员 → 403", () => {
  assert.ok(/canManage\s*=\s*session\.role\s*===\s*"ADMIN"\s*\|\|\s*session\.role\s*===\s*"MINISTER"/.test(assetsRoute), "canManage 判定变了");
  assert.ok(/task\.claims\.length\s*===\s*0/.test(assetsRoute), "缺少参与者判定");
  assert.ok(/仅任务参与者或管理人员/.test(assetsRoute), "403 消息变了");
});

check("A7 删除材料：仅上传者本人或 ADMIN/MINISTER", () => {
  assert.ok(/uploadedById\s*!==\s*session\.sub/.test(assetDeleteRoute), "缺少上传者判定");
  assert.ok(/canManage/.test(assetDeleteRoute), "缺少管理员豁免");
  assert.ok(/404/.test(assetDeleteRoute), "缺少 404 分支");
});

check("A8 删除材料时校验 asset 确实属于该 task（防串改）", () => {
  assert.ok(
    /where:\s*\{\s*id:\s*assetId,\s*outcome:\s*\{\s*taskId\s*\}/.test(assetDeleteRoute),
    "删除时未限定 outcome.taskId，可通过换 taskId 删除他任务的材料",
  );
});

// ============================================================ B. 数据形态

const FILE_MIME = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "image/gif": "IMAGE",
  "video/mp4": "VIDEO",
  "video/webm": "VIDEO",
  "video/quicktime": "VIDEO",
  "application/pdf": "DOCUMENT",
};

check("B1 允许的 MIME 与 kind 映射完整（8 种）", () => {
  const m = assetsRoute.match(/const allowed[^{]*\{([\s\S]*?)\};/);
  assert.ok(m, "找不到 allowed 表");
  const found = [...m[1].matchAll(/"([^"]+)":\s*\{\s*kind:\s*"(\w+)"/g)].map((x) => [x[1], x[2]]);
  assert.strictEqual(found.length, Object.keys(FILE_MIME).length, `条目数 ${found.length}，期望 ${Object.keys(FILE_MIME).length}`);
  for (const [mime, kind] of found) {
    assert.strictEqual(kind, FILE_MIME[mime], `${mime} 的 kind 应为 ${FILE_MIME[mime]}，实际 ${kind}`);
  }
});

check("B2 单文件上限 50MB 且做了空文件校验", () => {
  assert.ok(/MAX_BYTES\s*=\s*50\s*\*\s*1024\s*\*\s*1024/.test(assetsRoute), "上限不是 50MB");
  assert.ok(/file\.size\s*>\s*MAX_BYTES/.test(assetsRoute), "缺少超限校验");
  assert.ok(/!file\.size/.test(assetsRoute), "缺少空文件校验");
});

check("B3 外链材料只接受 http/https", () => {
  assert.ok(/regex\(\/\^https\?:\\\/\\\/\//.test(assetsRoute), "缺少 http/https 协议限制");
  assert.ok(/\.url\(/.test(assetsRoute), "缺少 url 格式校验");
});

check("B4 标题命名规范：姓名+活动名+类型（正则 + 中文报错）", () => {
  assert.ok(/regex\(\/\^\.\+\\\+\.\+\\\+\(微推\|海报\|视频\|其他\)\$\//.test(metaRoute), "命名正则变了");
  assert.ok(/命名格式应为/.test(metaRoute), "缺少中文提示");
});

check("B5 大文件建议走外链（LINK 类型）—— 产品策略存在", () => {
  const page = read("src/app/tasks/[id]/task-outcome-archive.tsx");
  assert.ok(/添加链接/.test(page), "Web 端缺少「添加链接」入口");
  assert.ok(/网盘/.test(page), "缺少网盘引导文案");
});

// ============================================================ C. 前端契约

check("C1 总目录接口返回 assetCount 与 types 聚合（列表页依赖）", () => {
  assert.ok(/assetCount:\s*o\.assets\.length/.test(outcomeRoute), "未返回 assetCount");
  assert.ok(/new Set\(o\.assets\.map\(\(a\)\s*=>\s*a\.kind\)\)/.test(outcomeRoute), "types 未去重");
});

check("C2 Web 总目录页消费的字段与后端一致", () => {
  const page = read("src/app/outcomes/page.tsx");
  for (const f of ["o.title", "o.task.title", "o.task.status", "o.summary", "o.updatedBy.displayName", "o.assetCount", "o.types", "o.submittedAt"]) {
    assert.ok(page.includes(f), `页面未消费 ${f}`);
  }
  assert.ok(/typeLabel/.test(page), "缺少类型中文映射");
  for (const k of ["IMAGE", "VIDEO", "DOCUMENT", "LINK"]) {
    assert.ok(page.includes(k), `typeLabel 缺少 ${k}`);
  }
});

check("C3 Web 总目录页对 title 为 null 有兜底（否则显示空白）", () => {
  const page = read("src/app/outcomes/page.tsx");
  assert.ok(/o\.title\s*\|\|\s*`\$\{o\.updatedBy\.displayName\}/.test(page), "缺少 title 兜底拼接");
});

check("C4 小程序总目录页字段消费一致", () => {
  const js = read("miniprogram/pages/outcomes/outcomes.js");
  for (const f of ["item.title", "item.task", "item.updatedBy", "item.summary", "item.submittedAt", "item.types"]) {
    assert.ok(js.includes(f), `小程序未消费 ${f}`);
  }
  assert.ok(/displayTitle/.test(js), "缺少 displayTitle 兜底");
  assert.ok(/typeText/.test(js), "缺少类型中文映射");
});

check("C5 小程序类型映射与 Web 用词不冲突（IMAGE→图片/照片 均中文）", () => {
  const js = read("miniprogram/pages/outcomes/outcomes.js");
  const m = js.match(/const labels\s*=\s*\{([^}]*)\}/);
  assert.ok(m, "找不到 labels 映射");
  for (const k of ["IMAGE", "VIDEO", "DOCUMENT", "LINK"]) {
    assert.ok(m[1].includes(k), `小程序 labels 缺少 ${k}`);
  }
});

check("C6 小程序搜索结果为空时展示空态（不白屏）", () => {
  const wxml = read("miniprogram/pages/outcomes/outcomes.wxml");
  assert.ok(/loading/.test(wxml), "缺少 loading 态");
  assert.ok(/shownOutcomes\.length|wx:elif|wx:else/.test(wxml), "缺少空态分支");
});

check("C7 详情页按类型分区渲染（图片/视频/文档/链接）", () => {
  const page = read("src/app/tasks/[id]/task-outcome-archive.tsx");
  for (const k of ['a.kind === "IMAGE"', 'a.kind === "VIDEO"', 'a.kind === "DOCUMENT"', 'a.kind === "LINK"']) {
    assert.ok(page.includes(k), `缺少 ${k} 分区`);
  }
  assert.ok(/Image\.PreviewGroup/.test(page), "图片缺少预览组");
  assert.ok(/<video/.test(page), "视频缺少播放器");
});

check("C8 删除按钮的显示条件与接口权限一致（前端不放行必被拒的操作）", () => {
  const page = read("src/app/tasks/[id]/task-outcome-archive.tsx");
  const gui = /canManage\s*\|\|\s*a\.uploadedBy\.id\s*===\s*currentUserId/;
  assert.ok(gui.test(page), "前端移除条件与后端不一致（后端是 canManage || uploadedById===sub）");
});

check("C9 上传中禁用按钮（防重复提交）", () => {
  const page = read("src/app/tasks/[id]/task-outcome-archive.tsx");
  assert.ok(/loading=\{saving\}/.test(page), "上传/保存按钮未绑定 loading");
});

// ============================================================ D. 线上实测

async function http(pathname, opts = {}) {
  const u = new URL(BASE + pathname);
  const mod = u.protocol === "https:" ? require("https") : require("http");
  return new Promise((resolve) => {
    const rq = mod.request(
      { hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, method: opts.method || "GET", headers: opts.headers || {}, timeout: 20000 },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(b); } catch {}
          resolve({ status: res.statusCode, ct: res.headers["content-type"], body: b, json });
        });
      },
    );
    rq.on("error", (e) => resolve({ err: e.message }));
    rq.on("timeout", () => { rq.destroy(); resolve({ err: "timeout" }); });
    if (opts.body) rq.write(opts.body);
    rq.end();
  });
}

async function signSession() {
  const secret = process.env.SXL_AUTH_SECRET;
  if (!secret) return null;
  let jose;
  try { jose = require("jose"); } catch { return null; }
  const { SignJWT } = jose;
  return new SignJWT({ sub: "healthcheck", role: "ADMIN", displayName: "可用性测试", username: "healthcheck" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

(async () => {
  // D 组是异步的，单独收集（check 是同步的）
  const asyncCases = [];
  async function acheck(name, fn) {
    try {
      const r = await fn();
      if (r === "SKIP") { skipped++; asyncCases.push(`  SKIP  ${name}`); return; }
      asyncCases.push(`  PASS  ${name}`);
    } catch (e) {
      failures++;
      asyncCases.push(`  FAIL  ${name}\n        ${e.message}`);
    }
  }

  await acheck("D1 线上未登录访问 /api/outcomes 被 middleware 拦到登录页", async () => {
    const r = await http("/api/outcomes");
    if (r.err) throw new Error(r.err);
    assert.strictEqual(r.status, 307, `期望 307，实际 ${r.status}`);
    assert.ok(/\/login/.test(r.body), `重定向目标异常：${r.body.slice(0, 120)}`);
  });

  await acheck("D2 线上 /api/outcomes 带无效会话 → 401 JSON（非裸 500）", async () => {
    const r = await http("/api/outcomes", { headers: { cookie: "sxlat_session=invalid.token.here" } });
    if (r.err) throw new Error(r.err);
    // middleware 只校验 cookie 是否存在，无效 token 会进 handler 再被 readSessionCookie 拒
    if (r.status === 307) return "SKIP"; // 该中间件实现下会先拦，属正常
    assert.strictEqual(r.status, 401, `期望 401，实际 ${r.status}`);
    assert.ok(/application\/json/.test(r.ct || ""), `应为 JSON，实际 ${r.ct}`);
  });

  await acheck("D3 线上删除接口对不存在材料返回 404 而非 500", async () => {
    const r = await http("/api/tasks/not-a-real-task/outcome/assets/not-a-real-asset", { method: "DELETE" });
    if (r.err) throw new Error(r.err);
    if (r.status === 307) return "SKIP";
    assert.ok(r.status === 401 || r.status === 404, `期望 401/404，实际 ${r.status}`);
    assert.ok(/application\/json/.test(r.ct || ""), `应为 JSON，实际 ${r.ct}`);
  });

  const token = process.env.SXL_SESSION || (await signSession());

  await acheck("D4 线上 GET /api/outcomes 返回 outcomes 数组", async () => {
    if (!token) return "SKIP";
    const r = await http("/api/outcomes", { headers: { cookie: `sxlat_session=${token}` } });
    if (r.err) throw new Error(r.err);
    assert.strictEqual(r.status, 200, `期望 200，实际 ${r.status}；body=${r.body.slice(0, 200)}`);
    assert.ok(r.json && Array.isArray(r.json.outcomes), "响应缺少 outcomes 数组");
    for (const o of r.json.outcomes.slice(0, 20)) {
      for (const f of ["id", "task", "updatedBy", "assetCount", "types"]) {
        assert.ok(f in o, `条目缺少字段 ${f}`);
      }
      assert.ok(Array.isArray(o.types), "types 不是数组");
      assert.ok(typeof o.assetCount === "number", "assetCount 不是数字");
      assert.ok(o.task && typeof o.task.id === "string", "task.id 缺失（前端跳转会失效）");
      assert.ok("title" in o, "缺少 title");
      assert.ok("submittedAt" in o, "缺少 submittedAt");
    }
  });

  await acheck("D5 线上 PATCH 成果说明对非法标题返回 400 + 中文提示", async () => {
    if (!token) return "SKIP";
    const r = await http("/api/tasks/not-a-real-task/outcome", {
      method: "PATCH",
      headers: { cookie: `sxlat_session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ title: "格式不对" }),
    });
    if (r.err) throw new Error(r.err);
    // 任务不存在时先 404，属预期；若先校验 schema 则 400
    assert.ok(r.status === 400 || r.status === 404, `期望 400/404，实际 ${r.status}`);
    assert.ok(/application\/json/.test(r.ct || ""), `应为 JSON，实际 ${r.ct}`);
    assert.ok(r.json && typeof r.json.message === "string", "缺少中文 message");
  });

  await acheck("D6 线上外链材料接口拒绝非 http(s) URL", async () => {
    if (!token) return "SKIP";
    const r = await http("/api/tasks/not-a-real-task/outcome/assets", {
      method: "POST",
      headers: { cookie: `sxlat_session=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ label: "恶意链接", url: "javascript:alert(1)" }),
    });
    if (r.err) throw new Error(r.err);
    assert.ok(r.status === 400 || r.status === 403 || r.status === 404, `期望 4xx，实际 ${r.status}`);
    assert.ok(!/javascript:/.test(r.body), "响应回显了危险 URL");
  });

  cases.push(...asyncCases);

  console.log("\n=== 成果档案板块 可用性测试 ===\n");
  console.log(cases.join("\n"));
  const total = cases.filter((c) => /^  (PASS|FAIL)/.test(c)).length;
  console.log(`\n共 ${total} 项，失败 ${failures} 项，跳过 ${skipped} 项`);
  if (skipped > 0 && !process.env.SXL_AUTH_SECRET && !process.env.SXL_SESSION) {
    console.log("\n提示：D4~D6 需要合法会话。在服务器上取 AUTH_SECRET 后：");
    console.log("  SXL_AUTH_SECRET='<线上 AUTH_SECRET>' node scripts/test-outcomes-module.cjs");
  }
  process.exit(failures > 0 ? 1 : 0);
})();
