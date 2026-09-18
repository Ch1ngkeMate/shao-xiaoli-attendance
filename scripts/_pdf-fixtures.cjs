/*
 * _pdf-fixtures.cjs —— 定位测试用的课表 PDF
 *
 * 为什么需要它：这些 PDF 是微信里收到的，路径会变。
 * 之前写死在 `temp/RWTemp/2026-09/<hash>/`，微信一清临时目录，
 * 端到端测试就整体 SKIP，还报「通过 0 失败 0」——**假绿灯**，
 * 比测试失败更危险（看不出内容验证已经没在跑了）。
 *
 * 现在按候选目录顺序查找，全部找不到时由调用方明确报错退出。
 *
 * 注意：不把这些 PDF 拷进仓库 —— 里面有学生姓名和课表，属于个人信息。
 */
const fs = require("fs");
const path = require("path");

const WX = "C:/Users/95345/Documents/xwechat_files/wxid_7a7kdwgqe36t22_6212";

/** 候选根目录（按优先级），每个下面可能是「直接放文件」或「一层 hash 子目录」 */
const ROOTS = [
  `${WX}/msg/file/2026-09`,
  `${WX}/temp/RWTemp/2026-09`,
  "D:/develop/xiang_mu/shao-xiaoli-attendance/output/_pdf",
  "C:/Users/95345/Downloads",
  "C:/Users/95345/Desktop",
];

/** 学生 → 文件名。同一份 PDF 在不同批次里可能叫「李亦然」或「李奕然」。 */
const FILES = {
  郭亦菲: ["郭亦菲(2026-2027-1)课表.pdf"],
  高毅: ["高毅(2026-2027-1)课表.pdf"],
  陈亚楠: ["陈亚楠(2026-2027-1)课表.pdf"],
  // ⚠️ PDF 内部标题是「李奕然课表」，文件名也是「李奕然」；需求里写的「李亦然」是笔误
  李奕然: ["李奕然(2026-2027-1)课表.pdf", "liyiran.pdf", "李亦然(2026-2027-1)课表.pdf"],
};

function exists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
}

/** 在 root 下找 filename：先直接找，再找一层子目录，最后有界递归 */
function findIn(root, filename) {
  const direct = path.join(root, filename);
  if (exists(direct)) return direct;

  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(root, e.name);
    const hit = path.join(sub, filename);
    if (exists(hit)) return hit;
    // hash 目录里再套一层的情况也兜一下
    let inner = [];
    try {
      inner = fs.readdirSync(sub, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const f of inner) {
      if (!f.isDirectory()) continue;
      const deeper = path.join(sub, f.name, filename);
      if (exists(deeper)) return deeper;
    }
  }
  return null;
}

/** 返回 pdf 绝对路径，找不到返回 null */
function resolve(name) {
  const candidates = FILES[name] || [`${name}(2026-2027-1)课表.pdf`];
  for (const root of ROOTS) {
    for (const filename of candidates) {
      const hit = findIn(root, filename);
      if (hit) return hit;
    }
  }
  return null;
}

/** 批量解析；返回 { name: path|null } */
function resolveAll(names) {
  const out = {};
  names.forEach((n) => {
    out[n] = resolve(n);
  });
  return out;
}

/**
 * 找不到就**明确报错**。绝不静默跳过 —— 静默跳过会让测试套件在
 * 「内容级验证其实没跑」的情况下依然报全绿。
 */
function requireAll(names, label) {
  const found = resolveAll(names);
  const missing = names.filter((n) => !found[n]);
  if (missing.length) {
    console.error("");
    console.error(`❌ ${label}：以下课表 PDF 找不到，测试无法运行`);
    missing.forEach((n) => console.error(`   ${n}  （已找过：${ROOTS.join(" | ")}）`));
    console.error("   请把 PDF 放到其中一个目录，或修改 scripts/_pdf-fixtures.cjs 的 ROOTS。");
    console.error("   注意：找不到就报错是**故意的** —— 静默跳过会给出假绿灯。");
    process.exit(1);
  }
  return found;
}

module.exports = { ROOTS, FILES, resolve, resolveAll, requireAll };
