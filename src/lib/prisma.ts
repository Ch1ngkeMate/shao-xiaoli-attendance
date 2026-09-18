import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaInitError: Error | undefined;
}

/**
 * 数据库未就绪时暴露的错误类型。
 *
 * 2026-09-17 修复：此前 `createPrismaClient()` 在模块顶层直接 throw，
 * 一旦 `DATABASE_URL` 缺失，**整个 route 模块加载失败** —— Next 会返回一个
 * 不带任何信息的 `text/plain` 500，业务代码里的 try/catch 与 zod 校验完全没机会执行。
 *
 * 后果是极难排查：因为多数接口被 middleware 的 307 挡住、prisma 模块从未真正加载，
 * 症状伪装成「只有登录进不去」而不是「全站挂掉」。
 *
 * 现在改为「构造客户端时把错误记下来，真正查询时才抛出」，这样：
 *   1. 模块加载永不失败，测试/构建/不依赖 DB 的接口不受牵连；
 *   2. 业务侧的 try/catch 能正常捕获；
 *   3. 错误信息带上「检查 .env 的 DATABASE_URL」，不用再去猜。
 */
export class DatabaseNotReadyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseNotReadyError";
  }
}

/** 生产环境下 PM2 重启前进程常驻，缓存起来避免重复建连；开发环境挂到 global 以支持热重载 */
function getOrCreatePrisma(): PrismaClient {
  if (global.__prisma) return global.__prisma;

  try {
    global.__prisma = buildPrismaClient();
    global.__prismaInitError = undefined;
  } catch (e) {
    global.__prismaInitError = e instanceof Error ? e : new Error(String(e));
    // 用一个「每次访问都抛错」的代理占位：既保持 `prisma.user.findMany()` 的调用形态不变，
    // 又把失败推迟到真正使用数据库的那一刻。
    global.__prisma = createFailingProxy(global.__prismaInitError) as PrismaClient;
  }

  return global.__prisma;
}

function buildPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new DatabaseNotReadyError(
      "缺少环境变量 DATABASE_URL —— 请检查生产/本机 .env（示例：mysql://用户:密码@127.0.0.1:3306/数据库名）",
    );
  }
  // Prisma 7：通过官方 MariaDB 驱动适配器连接 MySQL / MariaDB（连接串与 prisma migrate 使用同一 DATABASE_URL）
  const adapter = new PrismaMariaDb(url);
  return new PrismaClient({ adapter });
}

/**
 * 构造一个「任何属性访问都抛原始错误」的代理。
 * 用于 `DATABASE_URL` 缺失等初始化失败场景：不再让模块加载期崩溃，
 * 而是把可读错误原样带到调用点。
 *
 * 关键细节：`get` 陷阱必须**直接 throw**，不能返回一个 thrower 函数。
 * 否则 `prisma.user` 会返回 thrower，`.findMany` 再被 get 接住又返回 thrower，
 * 最终 `prisma.user.findMany` 拿到的是函数本身 —— throw 被推迟到调用时才发生，
 * 而 `prisma.user.count` 这种没被调用的形态会静默通过，埋出新的「不报错但不对」。
 */
function createFailingProxy(err: Error): unknown {
  return new Proxy(Object.create(null), {
    get(_target, prop) {
      // 让 instanceof / util.inspect / Promise 判定之类的基础操作不至于无限递归
      if (prop === "then" || prop === "constructor") return undefined;
      if (prop === Symbol.toStringTag) return "PrismaClient";
      if (prop === "toString") return () => `[DatabaseNotReady: ${err.message}]`;
      if (prop === "inspect" || prop === Symbol.for("nodejs.util.inspect.custom")) {
        return () => `[DatabaseNotReady: ${err.message}]`;
      }
      throw err;
    },
    apply() {
      throw err;
    },
  });
}

export const prisma: PrismaClient = getOrCreatePrisma();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

