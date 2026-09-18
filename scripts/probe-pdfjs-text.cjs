/**
 * 服务端抽取层诊断：直接打印 pdfjs-dist 抽到的文字碎片 + 设备坐标
 * ============================================================================
 * 用途：服务端解析结果不对时，**先看这一层**——确认到底是
 *   · pdf.js 没解出中文（→ CMap 工厂问题，见 extract.ts 注释）
 *   · 还是坐标语义变了（→ x 应判节次、y 应判星期）
 *   · 还是课表重建（rebuild.ts）的分块/字段解析出了问题
 *
 * 用法：
 *   node scripts/probe-pdfjs-text.cjs <pdf> [前 N 条，默认 60]
 *   node scripts/probe-pdfjs-text.cjs <pdf> --all     # 全部
 *
 * 对照工具：
 *   node scripts/probe-raw.cjs <pdf> [weekday]   # 本地解析器的分块结果
 *   node scripts/parse-pdf.cjs <pdf> [--json]    # 本地解析器的最终记录
 */
require("tsx/cjs");

const fs = require("fs");
const path = require("path");
const { extractPdfText } = require("../src/lib/schedule-pdf/extract.ts");

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error("用法：node scripts/probe-pdfjs-text.cjs <pdf> [前 N 条 | --all]");
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`文件不存在：${file}`);
    process.exit(2);
  }

  const arg = process.argv[3];
  const limit = arg === "--all" ? Infinity : Number(arg) || 60;

  const r = await extractPdfText(new Uint8Array(fs.readFileSync(file)));

  console.log("=".repeat(96));
  console.log(`文件：${path.basename(file)}`);
  console.log(`引擎：${r.engine}`);
  console.log(`页数：${r.pageCount}　字符数：${r.charCount}　碎片数：${r.items.length}`);
  console.log(`有文字层：${r.hasTextLayer ? "是" : "否（扫描件，需 OCR）"}`);
  (r.notes || []).forEach((n) => console.log(`· ${n}`));
  console.log("=".repeat(96));

  if (!r.hasTextLayer) {
    console.log("\n没有文字层，下面没有可打印的碎片。");
    return;
  }

  console.log(
    "\n序号  页码  文字                                     x(节次)     y(星期)      宽     高",
  );
  console.log("-".repeat(96));

  r.items.slice(0, limit === Infinity ? r.items.length : limit).forEach((t, i) => {
    console.log(
      String(i).padStart(4),
      String(t.page).padStart(5),
      JSON.stringify(t.str).padEnd(40),
      t.x.toFixed(2).padStart(9),
      t.y.toFixed(2).padStart(10),
      t.w.toFixed(2).padStart(7),
      t.h.toFixed(2).padStart(6),
    );
  });

  if (limit !== Infinity && r.items.length > limit) {
    console.log(`\n（只显示前 ${limit} 条，共 ${r.items.length} 条；用 --all 看全部）`);
  }
})();
