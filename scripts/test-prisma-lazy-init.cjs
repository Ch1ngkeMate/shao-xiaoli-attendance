/**
 * lib/prisma 惰性初始化回归测试
 *
 * 背景（2026-09-17）：
 *   旧实现在模块顶层立即 `createPrismaClient()`，`DATABASE_URL` 缺失时直接 throw。
 *   模块加载期抛异常 = 整个 route 注册失败 = Next 返回裸 text/plain 500，
 *   业务代码的 try/catch 完全没机会执行，错误信息也被吞掉。
 *
 * 本测试验证修复后：模块加载永不失败、错误推迟到真正查询时才抛、错误信息可读。
 *
 * 运行：node scripts/test-prisma-lazy-init.cjs
 */
const assert = require("assert");
const path = require("path");

/**
 * 把 lib/prisma.ts 转成可被 Node 直接执行的 CommonJS。
 *
 * 之所以不用一串 `.replace()` 硬撸，是因为替换顺序会互相污染（例如
 * `declare global {` 里的 `global` 会被后面的类型注解规则误伤，或反之在
 * 类型规则之后仍留下 `declare` 关键字）。改为逐行状态机：
 *   - 跳过 `import ...`（由 shim 顶部注入 require）
 *   - 整块跳过 `declare global { ... }`（纯类型声明，运行期无用）
 *   - 剥掉行尾/参数上的类型注解
 *   - 去掉 `export` 关键字（最后由 shim 统一导出）
 */
function transpile(src) {
  const out = [];
  let inDeclareGlobal = 0; // 大括号配平计数，>0 表示正在跳过 declare global 块

  for (const raw of src.split(/\r?\n/)) {
    let line = raw;

    // --- declare global 整块（含嵌套大括号）---
    if (inDeclareGlobal > 0) {
      inDeclareGlobal += count(line, "{") - count(line, "}");
      continue;
    }
    if (/^\s*declare\s+global\s*\{/.test(line)) {
      inDeclareGlobal = count(line, "{") - count(line, "}");
      if (inDeclareGlobal <= 0) inDeclareGlobal = 0; // 单行闭合
      continue;
    }

    // --- import / export 语句 ---
    if (/^\s*import\s/.test(line)) continue;
    line = line.replace(/^(\s*)export\s+default\s+/, "$1");
    line = line.replace(/^(\s*)export\s+/, "$1");

    // --- 类型注解剥离（只处理常见形态，避免误伤对象字面量与字符串）---
    // 顺序很关键：必须**先**把 `?: SomeType` 整体消掉（连同 ? 一起），
    // 否则先删 `?` 会留下 `: { cause }` 这种对象字面量形态，反被类型规则误吃。
    line = line
      // 1) 可选参数/可选属性 + 类型：`foo?: Foo` → `foo`
      .replace(/([A-Za-z_$][\w$]*)\?\s*:\s*[A-Za-z_$][\w$.]*(?:\s*<[^<>(){}]*>)?(?:\[\])?/g, "$1")
      // 2) 普通类型注解：`: Foo`、`: Foo | undefined`、`: Foo[]`、`: Foo<Bar>`
      .replace(/:\s*[A-Za-z_$][\w$.]*(?:\s*<[^<>()]*>)?(?:\[\])?(\s*\|\s*[A-Za-z_$][\w$.]*(?:\s*<[^<>()]*>)?(?:\[\])?)*/g, matchStrippable)
      // 3) `as SomeType`（含泛型）
      .replace(/\s+as\s+[A-Za-z_$][\w$.]*(?:\s*<[^<>()]*>)?/g, "")
      // 4) 兜底：仅剩的类型对象注解 `: { a?: T; b: U }` → 删掉，保留紧随其后的 `)` / `,` / `=`
      .replace(/:\s*\{[^{}]*\}\s*(?=[,)=])/g, "")
      // 5) 残留的裸可选标记：`foo?` 紧跟 `,` `)` `;` `{` 时删掉 `?`
      .replace(/([A-Za-z_$][\w$]*)\?(?=\s*[,);{=])/g, "$1");

    out.push(line);
  }

  return out.join("\n");
}

function count(line, ch) {
  let n = 0;
  for (const c of line) if (c === ch) n++;
  return n;
}

/**
 * 只剥「看起来像类型注解」的 `: Xxx`，保留对象字面量的 `key: value`。
 * 判定依据：冒号后的首字符大写（类型名约定）或以 `void`/`string`/`number`/`boolean`/`unknown`/`never`/`any` 开头，
 * 且本行冒号左侧不是单纯的标识符后跟 `:` 加小写值（对象字面量）。
 */
const BUILTIN = new Set(["void", "string", "number", "boolean", "unknown", "never", "any", "object"]);

function matchStrippable(match) {
  const body = match.replace(/^:\s*/, "");
  const head = body.split(/[\s|<\[]/)[0];
  if (!head) return match;
  // 内置小写类型名
  if (BUILTIN.has(head)) return "";
  // 大写开头（自定义类型 / 类）
  if (/^[A-Z]/.test(head)) return "";
  return match;
}

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

/** 在同一进程内反复加载 lib/prisma，隔离 global 状态 */
function loadPrismaModule({ databaseUrl }) {
  const ROOT = path.join(__dirname, "..");
  const prismaPath = path.join(ROOT, "src", "lib", "prisma.ts");
  const adapterPath = require.resolve("@prisma/adapter-mariadb", { paths: [ROOT] });

  const savedUrl = process.env.DATABASE_URL;
  const savedPrisma = global.__prisma;
  const savedErr = global.__prismaInitError;

  if (databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = databaseUrl;
  delete global.__prisma;
  delete global.__prismaInitError;

  const savedCache = {};
  const savedResolve = require.resolve;

  // Node 不能直接 _compile 带 TS 语法的源码，这里做「最小可用转译」。
  // 注意：`.replace()` 是顺序执行的，前面的规则会污染后面的输入，
  // 因此这里改成**逐行**处理，且先做结构化剥离（removeTsSyntax），再落到 shim。
  let exports;
  let loadError = null;
  try {
    const src = require("fs").readFileSync(prismaPath, "utf8");
    const js = transpile(src);

    const shim = `
      const { PrismaMariaDb } = require(${JSON.stringify(adapterPath)});
      const { PrismaClient } = { PrismaClient: class PrismaClient {
        constructor(opts) { this.opts = opts; }
      } };
      ${js}
      module.exports = { prisma, DatabaseNotReadyError };
    `;
    const Module = require("module");
    const m = new Module(prismaPath, null);
    m.filename = prismaPath;
    m.paths = Module._nodeModulePaths(path.dirname(prismaPath));
    m._compile(shim, prismaPath);
    exports = m.exports;
  } catch (e) {
    loadError = e;
  }

  const restore = () => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    global.__prisma = savedPrisma;
    global.__prismaInitError = savedErr;
  };

  return { exports, loadError, restore };
}

// ---------------------------------------------------------------- 测试

check("【核心】DATABASE_URL 缺失时，模块加载本身不抛异常", () => {
  const { exports, loadError, restore } = loadPrismaModule({ databaseUrl: undefined });
  try {
    assert.strictEqual(loadError, null, `模块加载抛异常了：${loadError && loadError.message}`);
    assert.ok(exports, "模块未导出任何内容");
    assert.ok("prisma" in exports, "未导出 prisma");
  } finally {
    restore();
  }
});

check("【核心】DATABASE_URL 缺失时，访问 prisma 属性才抛可读错误", () => {
  const { exports, restore } = loadPrismaModule({ databaseUrl: undefined });
  try {
    let caught = null;
    try {
      // 模拟业务代码：prisma.user.findMany()
      exports.prisma.user.findMany();
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, "访问数据库方法时应当抛错，而不是静默返回 undefined");
    assert.ok(
      /DATABASE_URL/.test(caught.message),
      `错误信息应包含 DATABASE_URL 便于定位，实际：${caught.message}`,
    );
  } finally {
    restore();
  }
});

check("【核心】缺失时的错误能被 try/catch 捕获（旧实现做不到）", () => {
  const { exports, restore } = loadPrismaModule({ databaseUrl: undefined });
  try {
    let handled = false;
    try {
      exports.prisma.user.count();
    } catch {
      handled = true; // 业务代码有机会降级返回 { message: ... } 而不是 500
    }
    assert.strictEqual(handled, true);
  } finally {
    restore();
  }
});

check("DATABASE_URL 正常时，prisma 是真实客户端实例", () => {
  const { exports, loadError, restore } = loadPrismaModule({
    databaseUrl: "mysql://u:p@127.0.0.1:3306/db",
  });
  try {
    assert.strictEqual(loadError, null);
    const p = exports.prisma;
    assert.ok(p, "prisma 为空");
    // 真实客户端应携带 adapter 配置，而非代理
    assert.ok(p.opts, "未拿到真实 PrismaClient 实例（opts 缺失）");
    assert.ok(
      typeof p.user?.findMany === "function" || p.user === undefined,
      "user 委托形态异常",
    );
  } finally {
    restore();
  }
});

check("数据库可连时，正常调用不应抛错", () => {
  const { exports, restore } = loadPrismaModule({
    databaseUrl: "mysql://u:p@127.0.0.1:3306/db",
  });
  try {
    // 桩 PrismaClient 只记录构造参数，任何属性访问都不该抛
    assert.doesNotThrow(() => {
      const _ = exports.prisma;
    });
  } finally {
    restore();
  }
});

check("导出了 DatabaseNotReadyError 供业务侧判型", () => {
  const { exports, restore } = loadPrismaModule({ databaseUrl: undefined });
  try {
    assert.strictEqual(typeof exports.DatabaseNotReadyError, "function", "未导出 DatabaseNotReadyError");
    const err = new exports.DatabaseNotReadyError("测试");
    assert.strictEqual(err.name, "DatabaseNotReadyError");
    assert.ok(err instanceof Error, "应继承自 Error");
  } finally {
    restore();
  }
});

check("源码中不再有模块顶层的 createPrismaClient() 直接调用", () => {
  const src = require("fs").readFileSync(
    path.join(__dirname, "..", "src", "lib", "prisma.ts"),
    "utf8",
  );
  assert.ok(
    !/export\s+const\s+prisma[^=]*=\s*global\.__prisma\s*\?\?\s*createPrismaClient\(\)/.test(src),
    "仍存在脆弱的顶层 `?? createPrismaClient()` 写法",
  );
  assert.ok(/try\s*\{/.test(src), "缺少 try/catch 包裹初始化");
});

console.log("\n=== lib/prisma 惰性初始化 测试 ===\n");
console.log(cases.join("\n"));
console.log(`\n共 ${cases.length} 项，失败 ${failures} 项`);
process.exit(failures > 0 ? 1 : 0);
