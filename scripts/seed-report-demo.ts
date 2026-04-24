/**
 * 生成约 50 个测试任务：时间分散、积分 1-2、每任务最多 3 人；随机部员接取并完成（审核通过），便于测月报。
 * 会删除同前缀的旧测试任务（可重复跑）。
 */
import "dotenv/config";
import dayjs from "dayjs";
import { prisma } from "../src/lib/prisma";

const DEMO_PREFIX = "【测试】宣传部任务";
const N_TASKS = 50;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function main() {
  const allUsers = await prisma.user.findMany({
    where: { isActive: true },
  });
  const publisher =
    allUsers.find((u) => u.role === "MINISTER") || allUsers.find((u) => u.role === "ADMIN");
  const reviewer =
    allUsers.find((u) => u.role === "MINISTER" || u.role === "ADMIN") || publisher;
  if (!publisher || !reviewer) {
    throw new Error("需要至少一个部长或管理员账号作为发布/审核人");
  }

  const members = allUsers.filter((u) => u.role === "MEMBER");
  if (members.length < 1) {
    throw new Error("没有部员账号：请先导入或创建 MEMBER 后再运行本脚本");
  }

  const del = await prisma.task.deleteMany({
    where: { title: { startsWith: DEMO_PREFIX } },
  });
  console.log("已清理旧测试任务数：", del.count);

  for (let i = 0; i < N_TASKS; i++) {
    // 审核时间分散在最近 3 个月 + 本月的不同日期/时刻（便于月报有差异）
    const monthBack = i % 3; // 0: 当前月, 1: 上月, 2: 上上月（相对本月月初）
    const baseMonth = dayjs().startOf("month").subtract(monthBack, "month");
    const reviewT = baseMonth
      .add(1 + (i % 27), "day")
      .hour(7 + (i % 10))
      .minute((i * 13) % 60);
    if (!reviewT.isValid()) {
      throw new Error("时间计算异常");
    }

    const r = reviewT.toDate();
    const claimT = dayjs(r).subtract(1, "day").add((i * 11) % 6, "hour");
    const submitT = dayjs(r).subtract(1, "hour");
    // 任务时间：覆盖接取/提交/审核的区间，便于测试「已结束」等逻辑
    const startT = dayjs(claimT).subtract(2, "hour");
    const endT = dayjs(r).add(1, "hour");

    // 1～3 个部员（不超过成员数量与 3 的上限）
    const k = Math.min(1 + randInt(0, 2), 3, members.length);
    const pick = shuffle(members).slice(0, k);
    const points = 1 + (i % 2); // 1 与 2 交替略随机感

    await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: `${DEMO_PREFIX} #${i + 1}`,
          description: "脚本生成的测试数据",
          startTime: startT.toDate(),
          endTime: endT.toDate(),
          points,
          headcountHint: 3,
          status: "OPEN",
          publisherId: publisher.id,
        },
      });

      for (let p = 0; p < pick.length; p++) {
        const u = pick[p]!;
        const ct = dayjs(claimT)
          .add(p * 25, "minute")
          .toDate();
        const st = dayjs(submitT)
          .add(p * 3, "minute")
          .toDate();
        const rt = dayjs(r)
          .add(p * 2, "minute")
          .toDate();

        await tx.taskClaim.create({
          data: {
            taskId: task.id,
            userId: u.id,
            status: "CLAIMED",
            claimTime: ct,
          },
        });

        const sub = await tx.taskSubmission.create({
          data: {
            taskId: task.id,
            userId: u.id,
            submitTime: st,
            note: "（测试数据）已提交",
          },
        });

        await tx.taskReview.create({
          data: {
            submissionId: sub.id,
            reviewerId: reviewer.id,
            reviewTime: rt,
            result: "APPROVED",
            reason: null,
          },
        });
      }
    });
  }

  console.log(
    `已创建 ${N_TASKS} 个任务；每个任务由 1～3 名随机部员接取并完成；审核已标记为通过。可打开「部员考勤 / 月报」查看。`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
