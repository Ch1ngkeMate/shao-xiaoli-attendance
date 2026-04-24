import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, Carousel, Descriptions, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import TaskActions from "./task-actions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TaskDetailPage({ params }: PageProps) {
  const session = await readSessionCookie();
  if (!session) return null;

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      publisher: true,
      images: { orderBy: { sort: "asc" } },
      claims: {
        where: { userId: session.sub },
        take: 1,
      },
      submissions:
        session.role === "ADMIN" || session.role === "MINISTER"
          ? {
              orderBy: { submitTime: "desc" },
              include: {
                user: true,
                evidenceImages: { orderBy: { sort: "asc" } },
                review: true,
              },
            }
          : {
              where: { userId: session.sub },
              take: 1,
              include: {
                user: true,
                evidenceImages: { orderBy: { sort: "asc" } },
                review: true,
              },
            },
    },
  });
  if (!task) return notFound();

  const mySubmission =
    session.role === "ADMIN" || session.role === "MINISTER"
      ? null
      : task.submissions[0]
        ? {
            id: task.submissions[0].id,
            submitTime: task.submissions[0].submitTime.toISOString(),
            note: task.submissions[0].note,
            evidenceImages: task.submissions[0].evidenceImages.map((e) => ({
              id: e.id,
              url: e.url,
            })),
            review: task.submissions[0].review
              ? {
                  result: task.submissions[0].review.result,
                  reason: task.submissions[0].review.reason,
                  reviewTime: task.submissions[0].review.reviewTime.toISOString(),
                }
              : null,
          }
        : null;

  const submissionsForReview =
    session.role === "ADMIN" || session.role === "MINISTER"
      ? task.submissions.map((s) => ({
          id: s.id,
          submitTime: s.submitTime.toISOString(),
          note: s.note,
          user: { displayName: s.user.displayName, username: s.user.username },
          evidenceImages: s.evidenceImages.map((e) => ({ id: e.id, url: e.url })),
          review: s.review
            ? {
                result: s.review.result,
                reason: s.review.reason,
                reviewTime: s.review.reviewTime.toISOString(),
              }
            : null,
        }))
      : [];

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {task.title}
        </Typography.Title>
        <Space>
          <Tag color={task.status === "OPEN" ? "green" : "default"}>
            {task.status === "OPEN" ? "可接取" : "已关闭"}
          </Tag>
          <Typography.Text type="secondary">
            发布人：{task.publisher.displayName}
          </Typography.Text>
        </Space>

        {task.images.length > 0 && (
          <Card>
            <Carousel autoplay>
              {task.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={img.url}
                  alt="任务图片"
                  style={{ width: "100%", maxHeight: 420, objectFit: "contain" }}
                />
              ))}
            </Carousel>
          </Card>
        )}

        <Card>
          <Descriptions column={1} size="middle">
            <Descriptions.Item label="时间">
              {dayjs(task.startTime).format("YYYY-MM-DD HH:mm")} ~{" "}
              {dayjs(task.endTime).format("YYYY-MM-DD HH:mm")}
            </Descriptions.Item>
            <Descriptions.Item label="积分">{task.points}</Descriptions.Item>
            <Descriptions.Item label="人数（参考）">
              {task.headcountHint ?? "不限制"}
            </Descriptions.Item>
            <Descriptions.Item label="描述">
              {task.description || "无"}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <TaskActions
          taskId={task.id}
          taskStatus={task.status}
          endTime={task.endTime.toISOString()}
          role={session.role}
          claimStatus={task.claims[0]?.status ?? null}
          mySubmission={mySubmission}
          submissionsForReview={submissionsForReview}
        />
      </Space>
    </div>
  );
}

