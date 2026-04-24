import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const RowSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["ADMIN", "MINISTER", "MEMBER"]),
  password: z.string().min(6),
});

/** 去掉 Excel「UTF-8 CSV」常带的 BOM */
function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

function normCell(s: string) {
  return stripBom(s).trim().replace(/^["']|["']$/g, "");
}

/**
 * 解析一行 CSV，支持英文双引号包裹的字段
 * sep 为单字符：逗号、分号或制表符
 */
function parseCsvLine(line: string, sep: string) {
  const res: string[] = [];
  let i = 0;
  let field = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    } else {
      if (c === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (c === sep) {
        res.push(normCell(field));
        field = "";
        i += 1;
        continue;
      }
      field += c;
      i += 1;
    }
  }
  res.push(normCell(field));
  return res;
}

const FIELD_ALIASES: Record<"username" | "displayName" | "role" | "password", string[]> = {
  username: ["username", "账号", "登录名", "用户", "user"],
  displayName: ["displayname", "display_name", "姓名", "名字", "显示名", "名称"],
  role: ["role", "身份", "角色", "权限", "类型"],
  password: ["password", "密码", "口令"],
};

function normalizeKey(s: string) {
  return normCell(s).toLowerCase().replace(/\s+/g, "");
}

function findFieldIndex(header: string[], field: keyof typeof FIELD_ALIASES) {
  const alts = FIELD_ALIASES[field];
  const altsNorm = alts.map((a) => normalizeKey(a));
  for (let col = 0; col < header.length; col++) {
    const h = normalizeKey(header[col] ?? "");
    for (const an of altsNorm) {
      if (h === an) return col;
    }
  }
  return -1;
}

function detectDelimiter(line: string) {
  const t = (line.match(/\t/g) || []).length;
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  if (t > 0 && t >= c && t >= s) return "\t";
  if (s > c) return ";";
  return ",";
}

type ExpandOpts = { isHeaderLine?: boolean };

/**
 * Excel 常把整行写进 A1，另存为 CSV 时整行被包成「一个引号字段」或解析后只剩一列。
 * 此时在英文逗号处再拆成多列即可。
 */
function expandCommaJoinedRow(parts: string[], minCols = 4, opts?: ExpandOpts) {
  if (parts.length >= minCols) return parts;
  if (parts.length !== 1) return parts;
  const cell = parts[0] ?? "";
  if (!cell.includes(",")) return parts;
  const sub = cell.split(",").map((s) => normCell(s));
  if (sub.length < minCols) return parts;
  if (sub.length === minCols) return sub;
  if (opts?.isHeaderLine) {
    // 表头多出的内容一般不应出现，只取前 4 格
    return sub.slice(0, minCols);
  }
  // 数据行超过 4 段：假定「姓名」中可能含英文逗号
  if (minCols === 4) {
    const username = sub[0] ?? "";
    const password = sub[sub.length - 1] ?? "";
    const role = sub[sub.length - 2] ?? "";
    const displayName = sub.slice(1, sub.length - 2).join(",");
    if (displayName) return [username, displayName, role, password];
  }
  return sub;
}

/** 将表格或口语中的角色统一成枚举值；已是英文的保持不变 */
function normalizeRole(raw: string): "ADMIN" | "MINISTER" | "MEMBER" | null {
  const v = normCell(raw);
  if (!v) return null;
  const u = v.toUpperCase();
  if (u === "ADMIN" || u === "MINISTER" || u === "MEMBER") {
    return u;
  }
  const m: Record<string, "ADMIN" | "MINISTER" | "MEMBER"> = {
    管理员: "ADMIN",
    部长: "MINISTER",
    部员: "MEMBER",
    干事: "MEMBER",
    成员: "MEMBER",
  };
  return m[v] ?? m[v.replace(/\s/g, "")] ?? null;
}

function resolveRole(raw: string): "ADMIN" | "MINISTER" | "MEMBER" | null {
  const a = normalizeRole(raw);
  if (a) return a;
  const u = normCell(raw).toUpperCase();
  if (u === "ADMIN" || u === "MINISTER" || u === "MEMBER") {
    return u;
  }
  return null;
}

function isXlsxOrZipFile(buf: ArrayBuffer) {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b) return true;
  if (u8.length >= 4 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return true;
  return false;
}

type ParsedRow = { lineNo: number; username: string; displayName: string; role: string; password: string };

function parseTable(text: string): { rows: ParsedRow[] } {
  const raw = stripBom(text);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [] };

  const sep = detectDelimiter(lines[0]!);
  const header = expandCommaJoinedRow(parseCsvLine(lines[0]!, sep), 4, { isHeaderLine: true });

  const usernameIdx = findFieldIndex(header, "username");
  const displayNameIdx = findFieldIndex(header, "displayName");
  const roleIdx = findFieldIndex(header, "role");
  const passwordIdx = findFieldIndex(header, "password");
  if ([usernameIdx, displayNameIdx, roleIdx, passwordIdx].some((i) => i < 0)) {
    const preview = lines[0]!.slice(0, 200);
    throw new Error(
      `无法识别表头。请确保第一行包含四列，列名可用：\n` +
        `  英文：username, displayName, role, password\n` +
        `  或中文：账号、姓名、身份/角色、密码\n` +
        `你文件第一行前 200 个字符是：\n` +
        `${preview}\n` +
        `并请先「另存为 .csv(UTF-8)」再上传。`,
    );
  }

  const rows: ParsedRow[] = lines.slice(1).map((line, lineNo) => {
    const cols = expandCommaJoinedRow(parseCsvLine(line, sep), 4);
    return {
      lineNo: lineNo + 2,
      username: cols[usernameIdx] ?? "",
      displayName: cols[displayNameIdx] ?? "",
      role: cols[roleIdx] ?? "",
      password: cols[passwordIdx] ?? "",
    };
  });
  return { rows };
}

export async function POST(req: Request) {
  const session = await readSessionCookie();
  if (!session) return NextResponse.json({ message: "未登录" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ message: "无权限" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "表单解析失败" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "缺少文件" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json(
      { message: "请上传 .csv 文件。在 Excel 中需另存为「CSV UTF-8(逗号分隔)」" },
      { status: 400 },
    );
  }

  const buf = await file.arrayBuffer();
  if (isXlsxOrZipFile(buf)) {
    return NextResponse.json(
      { message: "检测到的是工作簿/二进制文件，不是 CSV 文本。请在 Excel「另存为」选择 .csv(UTF-8) 后重试" },
      { status: 400 },
    );
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buf));
  let rows: ParsedRow[] = [];
  try {
    rows = parseTable(text).rows;
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const hints: string[] = [];

  for (const r of rows) {
    const roleEnum = resolveRole(r.role);
    if (!roleEnum) {
      skipped += 1;
      if (hints.length < 8) {
        hints.push(
          `第 ${r.lineNo} 行：无法识别角色「${r.role}」。请使用 ADMIN、MINISTER、MEMBER 或 管理员、部长、部员(干事)`,
        );
      }
      continue;
    }
    const parsed = RowSchema.safeParse({
      username: r.username,
      displayName: r.displayName,
      role: roleEnum,
      password: r.password,
    });
    if (!parsed.success) {
      skipped += 1;
      if (hints.length < 8) {
        hints.push(`第 ${r.lineNo} 行：${parsed.error.issues[0]?.message || "数据不合法"}`);
      }
      continue;
    }
    const row = parsed.data;
    const passwordHash = await bcrypt.hash(row.password, 10);
    const existed = await prisma.user.findUnique({ where: { username: row.username } });
    if (!existed) {
      await prisma.user.create({
        data: {
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          passwordHash,
          isActive: true,
        },
      });
      created += 1;
    } else {
      await prisma.user.update({
        where: { id: existed.id },
        data: {
          displayName: row.displayName,
          role: row.role,
          passwordHash,
          isActive: true,
        },
      });
      updated += 1;
    }
  }

  return NextResponse.json({ ok: true, created, updated, skipped, hints });
}
