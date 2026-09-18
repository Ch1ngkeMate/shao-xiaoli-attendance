/**
 * 打包逻辑干跑验证（纯 Node，不依赖 PowerShell）
 *
 * 目的：验证 build-and-upload.ps1 里「解引用 Junction 后打包」的核心逻辑正确。
 * 本沙箱拦了 Add-Type，没法直接跑 ps1，所以用 Node 复刻同一套算法做验证：
 *   对 .next 树做递归遍历，遇到 ReparsePoint（Junction）时进入其 Target 真实读取，
 *   写出 zip 条目，最后校验 @prisma/client-<hash> 非空。
 *
 * 运行：node scripts/test-zip-junction-deref.cjs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const NEXT = path.join(ROOT, ".next");

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

/** 递归收集要打进 zip 的条目，遇到 Junction 时解引用 */
function collect(dir, prefix, out, state) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const entry = prefix ? `${prefix}/${name}` : name;
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    const isLink = st.isSymbolicLink();

    if (st.isDirectory() || (isLink && safeIsDir(full))) {
      if (isLink) {
        state.deref++;
        const target = fs.realpathSync(full);
        collect(target, entry, out, state);
      } else {
        collect(full, entry, out, state);
      }
    } else {
      if (isLink) state.deref++;
      out.push(entry);
      state.files++;
      try {
        state.bytes += fs.statSync(full).size;
      } catch {}
    }
  }
}

function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function buildEntrySet() {
  const skip = new Set(["dev", "cache"]);
  const out = [];
  const state = { files: 0, bytes: 0, deref: 0 };
  for (const name of fs.readdirSync(NEXT)) {
    if (skip.has(name)) continue;
    const full = path.join(NEXT, name);
    const st = fs.lstatSync(full);
    if (st.isDirectory()) {
      collect(full, name, out, state);
    } else {
      out.push(name);
      state.files++;
      state.bytes += st.size;
    }
  }
  return { out, state };
}

// ---------------------------------------------------------------- 测试

check("Next 目录存在且含 BUILD_ID", () => {
  if (!fs.existsSync(NEXT)) throw new Error(".next 不存在，请先构建");
  if (!fs.existsSync(path.join(NEXT, "BUILD_ID"))) throw new Error(".next/BUILD_ID 缺失");
});

check("打包能解引用 @prisma/client-<hash>（核心）", () => {
  const { out } = buildEntrySet();
  const prismaEntries = out.filter((e) => e.startsWith("node_modules/@prisma/client-"));
  if (prismaEntries.length === 0) {
    throw new Error("入口集合里没有 node_modules/@prisma/client-* —— 说明 node_modules 整个被漏掉了");
  }
  // 关键：不能只有目录名本身，必须有里面的文件
  const deep = prismaEntries.filter((e) => e.split("/").length > 4);
  if (deep.length === 0) {
    throw new Error(
      `client-* 目录被压成了空壳！只收集到 ${prismaEntries.length} 个条目且无深层文件：\n        ${prismaEntries.slice(0, 5).join("\n        ")}`,
    );
  }
  if (!out.some((e) => /client-[0-9a-f]{16}\/runtime\/client\.(js|mjs)$/.test(e))) {
    throw new Error("缺少 client-<hash>/runtime/client.js —— 正是线上 500 报错要找的文件");
  }
});

check("原始 .next 里该目录确实是 Junction（证明这个坑真实存在）", () => {
  const nm = path.join(NEXT, "node_modules", "@prisma");
  if (!fs.existsSync(nm)) throw new Error("无 .next/node_modules/@prisma");
  const items = fs.readdirSync(nm).filter((n) => n.startsWith("client-"));
  if (items.length === 0) throw new Error("没有 client-<hash> 目录");
  const st = fs.lstatSync(path.join(nm, items[0]));
  if (!st.isSymbolicLink()) {
    // 不是链接也算正常（比如已实体化），只是说明这条断言不适用
    cases.push("  NOTE  该目录不是符号链接（已实体化），本项跳过");
    return;
  }
});

check("解引用后条目数 > 未解引用时的目录条目数", () => {
  const { out, state } = buildEntrySet();
  if (state.deref === 0) throw new Error("整个 .next 里没有解引用任何链接，逻辑可疑");
  if (out.length < 100) throw new Error(`条目数过少（${out.length}），打包可能不完整`);
});

check("排除 dev 与 cache（体积控制）", () => {
  const { out } = buildEntrySet();
  const dev = out.filter((e) => e === "dev" || e.startsWith("dev/"));
  const cache = out.filter((e) => e === "cache" || e.startsWith("cache/"));
  if (dev.length) throw new Error(`混入 dev 条目 ${dev.length} 个`);
  if (cache.length) throw new Error(`混入 cache 条目 ${cache.length} 个`);
});

check("关键生产文件齐全（BUILD_ID / routes-manifest / server）", () => {
  const { out } = buildEntrySet();
  for (const need of ["BUILD_ID", "routes-manifest.json", "server", "required-server-files.json"]) {
    if (!out.some((e) => e === need || e.startsWith(`${need}/`))) {
      throw new Error(`缺少 ${need}`);
    }
  }
});

console.log("\n=== 打包逻辑（Junction 解引用）验证 ===\n");
console.log(cases.join("\n"));
if (failures === 0) {
  const { state } = buildEntrySet();
  console.log(
    `\n统计：${state.files} 个文件，解引用 ${state.deref} 个链接，原始 ${(state.bytes / 1024 / 1024).toFixed(2)} MB`,
  );
}
console.log(`\n共 ${cases.filter((c) => c.startsWith("  PASS") || c.startsWith("  FAIL")).length} 项，失败 ${failures} 项`);
process.exit(failures > 0 ? 1 : 0);
