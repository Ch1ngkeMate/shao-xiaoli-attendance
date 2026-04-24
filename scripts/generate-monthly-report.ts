import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeMonthlyReportStats } from "../src/lib/monthly-report";

function getMonthArg() {
  const arg = process.argv.find((a) => a.startsWith("--month="));
  if (!arg) return null;
  return arg.slice("--month=".length);
}

async function main() {
  const month = getMonthArg();
  if (!month) {
    console.log("用法：npm run report:generate -- --month=YYYY-MM");
    process.exit(1);
  }

  const stats = await computeMonthlyReportStats(month);
  await prisma.monthlyReport.upsert({
    where: { month },
    create: {
      month,
      generatedBy: null,
      generatedAt: new Date(),
      statsJson: JSON.stringify(stats),
    },
    update: {
      generatedBy: null,
      generatedAt: new Date(),
      statsJson: JSON.stringify(stats),
    },
  });

  console.log("已生成月报：", month);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

