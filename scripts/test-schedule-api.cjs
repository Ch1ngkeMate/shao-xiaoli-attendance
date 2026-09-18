/**
 * 服务端课表解析 API —— 端到端集成测试
 * ============================================================================
 * 前两套测试（test-pdf-schedule-content / test-schedule-server）验证的是**解析逻辑**，
 * 但没验证「Next.js 里这个接口真能跑起来」—— 而 pdfjs-dist 是 ESM-only 且运行时要读
 * node_modules 里的 cmaps 资源，**打包方式不对就会在运行时炸**。
 * 本文件补上这一环：真的起一个 next dev，真的发一次 HTTP 上传。
 *
 * 鉴权说明：`readSessionCookie()` 对 Bearer token 只做 JWT 验签（不查库），
 * 所以这里用 AUTH_SECRET 自签一个 token 即可，不需要数据库和真实账号。
 *
 * 用法：npm run test:schedule:api
 */
require("tsx/cjs");

const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, execSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const fixtures = require("./_pdf-fixtures.cjs");

const PORT = Number(process.env.SCHEDULE_API_TEST_PORT || 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTE = `${BASE}/api/schedule/parse`;

let passed = 0;
const failures = [];
function check(desc, ok, got) {
  if (ok) {
    passed += 1;
    console.log(`  [OK]   ${desc}`);
  } else {
    failures.push(`${desc}　实际=${JSON.stringify(got)}`);
    console.log(`  [FAIL] ${desc}　实际=${JSON.stringify(got)}`);
  }
}

/** 等 dev server 端口可连 */
function waitPort(timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryOnce = () => {
      const socket = net.connect(PORT, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`dev server 在 ${timeoutMs}ms 内没起来`));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* 已退出 */
    }
  }
}

(async () => {
  if (!process.env.AUTH_SECRET) {
    console.error("❌ 缺少 AUTH_SECRET（.env 里要有），无法自签测试 token。");
    process.exit(2);
  }
  const pdfPath = fixtures.resolve("李奕然") || fixtures.resolve("郭亦菲");
  if (!pdfPath) {
    console.error("❌ 找不到任何测试课表 PDF。");
    process.exit(2);
  }

  console.log("=".repeat(76));
  console.log(`服务端解析 API 端到端测试（next dev :${PORT}）`);
  console.log("=".repeat(76));

  console.log("\n启动 next dev …");
  const child = spawn(
    process.execPath,
    [path.resolve(__dirname, "..", "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT)],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverLog = "";
  child.stdout.on("data", (d) => {
    serverLog += String(d);
  });
  child.stderr.on("data", (d) => {
    serverLog += String(d);
  });

  try {
    await waitPort(180000);
    console.log("dev server 已就绪。\n");

    // ---- 1. 未登录必须 401 ----
    {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), "a.pdf");
      const res = await fetch(ROUTE, { method: "POST", body: fd });
      check("未带 token → 401", res.status === 401, res.status);
    }

    // ---- 2. 自签 token（只验签，不查库）----
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({
      sub: "e2e-test",
      role: "ADMIN",
      displayName: "端到端测试",
      username: "e2e-test",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

    // ---- 3. 上传真实课表 PDF ----
    const fd = new FormData();
    fd.append("file", new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), "课表.pdf");
    const t0 = Date.now();
    const res = await fetch(ROUTE, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const firstMs = Date.now() - t0;
    let json;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    check("HTTP 200", res.status === 200, res.status);
    check("返回统一 JSON 结构", !!json && typeof json === "object", json && Object.keys(json));
    if (!json) throw new Error(`响应不是 JSON：${(await res.text().catch(() => "")).slice(0, 200)}`);

    check("ok=true", json.ok === true, json.ok);
    check("needsOcr=false", json.needsOcr === false, json.needsOcr);
    check("courses 非空", Array.isArray(json.courses) && json.courses.length > 0, json.courses && json.courses.length);
    check("含 warnings 字段（数组）", Array.isArray(json.warnings), typeof json.warnings);
    check("含 unmatchedCells 字段（数组）", Array.isArray(json.unmatchedCells), typeof json.unmatchedCells);
    check("confidence 在 0~1", typeof json.confidence === "number" && json.confidence >= 0 && json.confidence <= 1, json.confidence);
    check("engine 报告为 pdfjs-dist", /pdfjs-dist/.test(String(json.engine)), json.engine);

    // 每条课程字段完整（这是「识别预览」能标出缺字段的前提）
    const badShape = (json.courses || []).filter(
      (c) =>
        typeof c.courseName !== "string" ||
        typeof c.weekday !== "number" ||
        c.weekday < 1 ||
        c.weekday > 7 ||
        typeof c.startSection !== "number",
    );
    check("每条课程都有 courseName / weekday / startSection", badShape.length === 0, badShape.slice(0, 2));

    console.log(
      `\n  解析结果：${json.courses.length} 门课，置信度 ${Math.round(json.confidence * 100)}%，` +
        `引擎 ${json.engine}，首次请求 ${firstMs}ms`,
    );
    console.log("  前 3 门：");
    json.courses.slice(0, 3).forEach((c) => {
      console.log(
        `    · 周${c.weekday} 第${c.startSection}-${c.endSection}节 ${c.courseName}` +
          ` | ${c.teacher || "-"} | ${c.room || "-"} | ${c.weeks || "-"}${c.parity ? `(${c.parity})` : ""}`,
      );
    });

    // ---- 4. 非 PDF 必须被挡 ----
    {
      const fd2 = new FormData();
      fd2.append("file", new Blob([Buffer.from("hello world")], { type: "text/plain" }), "a.txt");
      const r2 = await fetch(ROUTE, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd2,
      });
      check("非 PDF 文件 → 400", r2.status === 400, r2.status);
    }

    // ---- 5. 图片走 OCR 分支（明确告知，不静默失败）----
    {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const fd3 = new FormData();
      fd3.append("file", new Blob([png], { type: "image/png" }), "shot.png");
      const r3 = await fetch(ROUTE, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd3,
      });
      const j3 = await r3.json().catch(() => null);
      check("图片 → 200 且 needsOcr=true", r3.status === 200 && j3 && j3.needsOcr === true, j3 && j3.needsOcr);
    }
  } catch (err) {
    check(`端到端流程未抛错（${err && err.message}）`, false, err && err.message);
    if (serverLog) console.log(`\n--- next dev 日志尾部 ---\n${serverLog.slice(-1500)}`);
  } finally {
    killTree(child);
  }

  console.log(`\n${"=".repeat(76)}`);
  if (failures.length) {
    console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log(`全部通过：${passed} 项（服务端解析 API 端到端）`);
  console.log("=".repeat(76));
  process.exit(0);
})();
