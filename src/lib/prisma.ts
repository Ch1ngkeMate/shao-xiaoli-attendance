import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("缺少环境变量 DATABASE_URL（MySQL 示例：mysql://用户:密码@127.0.0.1:3306/数据库名）");
  }
  // Prisma 7：通过官方 MariaDB 驱动适配器连接 MySQL / MariaDB（连接串与 prisma migrate 使用同一 DATABASE_URL）
  const adapter = new PrismaMariaDb(url);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

