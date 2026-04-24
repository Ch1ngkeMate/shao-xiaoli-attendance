import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const username = process.env.INIT_ADMIN_USERNAME || "admin";
  const password = process.env.INIT_ADMIN_PASSWORD || "admin123456";
  const displayName = process.env.INIT_ADMIN_DISPLAY_NAME || "系统管理员";

  const existed = await prisma.user.findUnique({ where: { username } });
  if (existed) {
    console.log("管理员账号已存在：", username);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username,
      displayName,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("已创建管理员账号：", username);
  console.log("初始密码：", password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

