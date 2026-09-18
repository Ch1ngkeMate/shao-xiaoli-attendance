/**
 * 服务端解析器回归测试
 * ============================================================================
 * 验证 `src/lib/schedule-pdf`（基于 pdfjs-dist 的服务端解析器）与
 * 小程序端手写解析器**在同一套期望值下结果一致**。
 *
 * 做法分两步：
 *   1) 用服务端解析器跑四份真实 PDF，把结果 dump 成 JSON；
 *   2) 带着 SCHEDULE_PARSE_JSON 环境变量重跑 `test-pdf-schedule-content.cjs`，
 *      复用那份 404 项逐字段期望表（比对逻辑与阈值完全一致，不会出现
 *      「本地一套标准、服务端另一套标准」的漂移）。
 *
 * 用法：npm run test:schedule:server
 */
require("tsx/cjs");

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const fixtures = require("./_pdf-fixtures.cjs");
const { parseSchedulePdfServer } = require("../src/lib/schedule-pdf/index.ts");

const NAMES = ["郭亦菲", "高毅", "陈亚楠", "李奕然"];

(async () => {
  const outDir = path.resolve(__dirname, "..", "output", "_pdf", "server-parse");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("=".repeat(76));
  console.log("服务端解析器（pdfjs-dist）—— 解析四份真实课表");
  console.log("=".repeat(76));

  let hardFail = 0;
  for (const name of NAMES) {
    const pdfPath = fixtures.resolve(name);
    if (!pdfPath) {
      console.error(`❌ 找不到 ${name} 的 PDF（对照 scripts/_pdf-fixtures.cjs 的 ROOTS）`);
      hardFail += 1;
      continue;
    }

    const bytes = new Uint8Array(fs.readFileSync(pdfPath));
    const t0 = Date.now();
    let res;
    try {
      res = await parseSchedulePdfServer(bytes);
    } catch (err) {
      console.error(`❌ ${name} 解析抛异常：${err && err.message}`);
      hardFail += 1;
      continue;
    }
    const ms = Date.now() - t0;

    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(res, null, 2), "utf8");

    console.log(
      `\n【${name}】 ok=${res.ok}  课程=${res.courses.length}  置信度=${res.confidence}  ` +
        `引擎=${res.engine}  页数=${res.stats.pageCount}  字符=${res.stats.charCount}  用时=${ms}ms`,
    );
    (res.warnings || []).forEach((w) => {
      console.log(`   - [${w.level}] ${w.code} ×${w.count}　${w.message}`);
      if (w.samples && w.samples.length) console.log(`       样例：${w.samples.join("、")}`);
    });
    (res.notes || []).forEach((n) => console.log(`   · ${n}`));
    if (!res.ok) hardFail += 1;
  }

  if (hardFail) {
    console.error(`\n❌ ${hardFail} 份 PDF 未能成功解析，跳过期望表比对。`);
    process.exit(1);
  }

  // --------------------------------------------------------------------------
  // 复用小程序解析器那套内容级期望表（同标准比对）
  // --------------------------------------------------------------------------
  console.log(`\n${"=".repeat(76)}`);
  console.log("用同一套期望表核对服务端解析结果");
  console.log("=".repeat(76));

  const r = spawnSync(process.execPath, [path.join(__dirname, "test-pdf-schedule-content.cjs")], {
    stdio: "inherit",
    env: { ...process.env, SCHEDULE_PARSE_JSON: outDir },
  });
  process.exit(r.status === null ? 1 : r.status);
})();
