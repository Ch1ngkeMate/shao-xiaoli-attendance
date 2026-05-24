/**
 * 一次性脚本：审批所有已关单任务中未审核的提交
 * 服务器执行: npx tsx scripts/approve-pending.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
    const pendingSubs = await prisma.taskSubmission.findMany({
        where: {
          review: null,
          task: { status: "CLOSED", excludeFromAttendance: false },
        },
        include: { task: { select: { publisherId: true } } },
      });

  console.log(`找到 ${pendingSubs.length} 条待审批提交`);

  for (const sub of pendingSubs) {
    await prisma.taskReview.create({
      data: {
        submissionId: sub.id,
        result: "APPROVED",
        reason: "历史收工任务自动确认",
        reviewerId: sub.task.publisherId,
      },
    });
    console.log(`  ✓ ${sub.id} (task: ${sub.taskId})`);
  }

  console.log("完成");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
