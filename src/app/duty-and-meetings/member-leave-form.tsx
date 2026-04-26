"use client";

import { Button, Card, Form, Input, Select, Table, message } from "antd";
import { useEffect } from "react";
import dayjs from "dayjs";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"];
const PERIODS = ["第1节", "第2节", "第3节", "第4节", "第5节"];

type MeetingRow = { id: string; title: string; startTime: string; endTime: string | null; status: string };
type LeaveR = {
  id: string;
  category: "DUTY" | "MEETING";
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  dutyWeekday: number | null;
  dutyPeriod: number | null;
  meeting?: { title: string; startTime: string } | null;
};

type MyDutyOption = { value: string; label: string };

type Props = {
  openMeetings: MeetingRow[];
  myDutySlotOptions: MyDutyOption[];
  leaveList: LeaveR[];
  onRefresh: () => void;
};

/**
 * 部员「请假」Tab：在内聚 useForm，避免部长/管理员进页时 lForm 无 Form 的 Hook 警告
 */
export function MemberLeaveForm({ openMeetings, myDutySlotOptions, leaveList, onRefresh }: Props) {
  const [lForm] = Form.useForm<{
    category: "DUTY" | "MEETING";
    reason: string;
    meetingId?: string;
    dutySlotKey?: string;
  }>();

  useEffect(() => {
    lForm.setFieldsValue({ category: "DUTY" });
  }, [lForm]);

  return (
    <div>
      <Card title="提交申请" size="small" style={{ maxWidth: 480, marginBottom: 16 }}>
        <Form
          form={lForm}
          layout="vertical"
          onFinish={async (v) => {
            if (v.category === "DUTY") {
              if (!v.dutySlotKey) {
                message.error("请选择要请假的值班");
                return;
              }
              const [ws, ps] = v.dutySlotKey.split("-");
              const w = Number(ws);
              const p = Number(ps);
              if (Number.isNaN(w) || Number.isNaN(p)) {
                message.error("值班选择无效");
                return;
              }
              const r = await fetch("/api/leave", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  category: "DUTY",
                  reason: v.reason,
                  dutyWeekday: w,
                  dutyPeriod: p,
                }),
              });
              const d = (await r.json().catch(() => ({}))) as { message?: string };
              if (!r.ok) return message.error(d.message || "失败");
              message.success("已提交，部长在消息中处理");
              lForm.resetFields();
              lForm.setFieldsValue({ category: "DUTY" });
              onRefresh();
              return;
            }
            const r = await fetch("/api/leave", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(v),
            });
            const d = (await r.json().catch(() => ({}))) as { message?: string };
            if (!r.ok) return message.error(d.message || "失败");
            message.success("已提交，部长在消息中处理");
            lForm.resetFields();
            lForm.setFieldsValue({ category: "DUTY" });
            onRefresh();
          }}
          initialValues={{ category: "DUTY" }}
        >
          <Form.Item name="category" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "DUTY", label: "值班请假" },
                { value: "MEETING", label: "会议请假" },
              ]}
              onChange={(cat) => {
                if (cat === "MEETING") lForm.setFieldsValue({ dutySlotKey: undefined });
                if (cat === "DUTY") lForm.setFieldsValue({ meetingId: undefined });
              }}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() =>
              lForm.getFieldValue("category") === "MEETING" && (
                <Form.Item name="meetingId" label="选择会议" rules={[{ required: true, message: "请选择会议" }]}>
                  <Select
                    showSearch
                    allowClear
                    options={openMeetings.map((m) => ({ value: m.id, label: m.title }))}
                    placeholder="已发布的未结束会议"
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() =>
              lForm.getFieldValue("category") === "DUTY" && (
                <Form.Item
                  name="dutySlotKey"
                  label="选择值班"
                  extra={
                    myDutySlotOptions.length === 0
                      ? "您尚未在值班表中被安排任何班，请部长在「值班表」格子中添加后再请值班假。"
                      : "仅可为您本人已被安排的格请假日"
                  }
                  rules={[{ required: true, message: "请选择要请假的值班" }]}
                >
                  <Select
                    allowClear
                    showSearch
                    options={myDutySlotOptions}
                    placeholder={
                      myDutySlotOptions.length === 0 ? "暂无被安排的值班" : "在值班表上为您排过的时段"
                    }
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {() => (
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  disabled={lForm.getFieldValue("category") === "DUTY" && myDutySlotOptions.length === 0}
                >
                  提交
                </Button>
              </Form.Item>
            )}
          </Form.Item>
        </Form>
      </Card>
      <Table<LeaveR>
        size="small"
        rowKey="id"
        dataSource={leaveList}
        pagination={false}
        title={() => "我的假条"}
        columns={[
          { title: "类型", render: (_, l) => (l.category === "DUTY" ? "值班" : "会议") },
          {
            title: "时间/会议",
            render: (_, l) =>
              l.meeting?.title ??
              (l.dutyWeekday != null && l.dutyPeriod != null ? `${WEEKDAYS[l.dutyWeekday!]}${PERIODS[l.dutyPeriod!]}` : "-"),
          },
          {
            title: "状态",
            render: (_, l) => (l.status === "PENDING" ? "待批" : l.status === "APPROVED" ? "同意" : "驳回"),
          },
          { title: "时间", dataIndex: "createdAt", render: (s: string) => dayjs(s).format("MM-DD HH:mm") },
        ]}
      />
    </div>
  );
}
