"use client";

import { Button, Card, Divider, Image, InputNumber, Modal, Space, Switch, Typography, Upload, message, theme } from "antd";
import type { UploadFile } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Ann = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  popupEnabled: boolean;
  popupDays: number;
  images: { id: string; url: string; sort: number }[];
};

type ReadUser = { id: string; displayName: string; username: string; avatarUrl: string | null; role: string };

export default function AnnouncementDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [ann, setAnn] = useState<Ann | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);

  const [imgUploading, setImgUploading] = useState(false);
  const [imgFileList, setImgFileList] = useState<UploadFile[]>([]);

  const isMgr = meRole === "ADMIN" || meRole === "MINISTER";

  async function load() {
    setLoading(true);
    try {
      // 角色从 /api/me 拿最稳，避免公告接口缓存/异常导致管理区不显示
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const me = (await meRes.json().catch(() => ({}))) as any;
      if (meRes.ok && me.user?.role) setMeRole(me.user.role);

      const res = await fetch(`/api/announcements/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { announcement?: Ann; meRole?: string; message?: string };
      if (!res.ok || !data.announcement) {
        message.error(data.message || "加载通知失败");
        setAnn(null);
        return;
      }
      if (data.meRole && !meRole) setMeRole(String(data.meRole));
      setAnn(data.announcement);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [readsOpen, setReadsOpen] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [readUsers, setReadUsers] = useState<ReadUser[]>([]);
  const [unreadUsers, setUnreadUsers] = useState<ReadUser[]>([]);

  async function loadReads() {
    setReadLoading(true);
    try {
      const res = await fetch(`/api/announcements/${encodeURIComponent(id)}/reads`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "加载已读名单失败");
        return;
      }
      setReadUsers(data.readUsers ?? []);
      setUnreadUsers(data.unreadUsers ?? []);
    } finally {
      setReadLoading(false);
    }
  }

  const readsSummary = useMemo(() => {
    if (!isMgr) return null;
    return `${readUsers.length} 已读 / ${unreadUsers.length} 未读`;
  }, [isMgr, readUsers.length, unreadUsers.length]);

  async function savePopupSetting(nextEnabled: boolean, nextDays: number) {
    const res = await fetch(`/api/announcements/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ popupEnabled: nextEnabled, popupDays: nextDays }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      message.error(data.message || "保存失败");
      return;
    }
    message.success("已保存");
    void load();
  }

  async function uploadOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!res.ok || !data.url) throw new Error(data.message || "上传失败");
    return data.url;
  }

  async function addImage(file: File) {
    setImgUploading(true);
    try {
      const url = await uploadOne(file);
      const res = await fetch(`/api/announcements/${encodeURIComponent(id)}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        message.error(data.message || "添加图片失败");
        return;
      }
      message.success("已添加图片");
      setImgFileList([]);
      void load();
    } catch (e: any) {
      message.error(e?.message || "上传失败");
    } finally {
      setImgUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    const res = await fetch(`/api/announcements/${encodeURIComponent(id)}/images?imageId=${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      message.error(data.message || "删除失败");
      return;
    }
    message.success("已删除");
    void load();
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card loading={loading} title="通知">
        {ann ? (
          <>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              {ann.title}
            </Typography.Title>
            <Typography.Text type="secondary">
              发布时间：{dayjs(ann.createdAt).format("YYYY-MM-DD HH:mm")}
            </Typography.Text>
            <Divider style={{ margin: "12px 0" }} />
            <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
              {ann.body}
            </Typography.Paragraph>
          </>
        ) : (
          <Typography.Text type="secondary">暂无内容</Typography.Text>
        )}
      </Card>

      {ann && ann.images.length > 0 && (
        <Card title="图片" size="small">
          <Space wrap>
            {ann.images.map((img) => (
              <div key={img.id} style={{ position: "relative" }}>
                <Image src={img.url} width={120} height={120} style={{ objectFit: "cover", borderRadius: 8 }} />
                {isMgr && (
                  <Button
                    danger
                    size="small"
                    style={{ position: "absolute", top: 6, right: 6 }}
                    onClick={() => void removeImage(img.id)}
                  >
                    删除
                  </Button>
                )}
              </div>
            ))}
          </Space>
        </Card>
      )}

      {ann ? (
        <Card title="管理" size="small">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {!isMgr ? <Typography.Text type="secondary">仅部长/管理员可见</Typography.Text> : null}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <Typography.Text strong>每日首次进入弹窗</Typography.Text>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                  仅站内弹窗；开启后会在公告创建日起持续 N 天尝试弹出（每人每天最多一次）。
                </div>
              </div>
              <Switch
                checked={ann.popupEnabled}
                disabled={!isMgr}
                onChange={(checked) => void savePopupSetting(checked, checked ? Math.max(1, ann.popupDays || 1) : 0)}
              />
            </div>
            {ann.popupEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Typography.Text>持续天数：</Typography.Text>
                <InputNumber
                  min={1}
                  max={365}
                  value={ann.popupDays || 1}
                  disabled={!isMgr}
                  onChange={(v) => void savePopupSetting(true, typeof v === "number" ? v : 1)}
                />
              </div>
            )}

            <Divider style={{ margin: "8px 0" }} />

            <div>
              <Typography.Text strong>图片管理</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Upload
                  accept="image/*"
                  beforeUpload={(file) => {
                    void addImage(file);
                    return false;
                  }}
                  fileList={imgFileList}
                  onChange={(info) => setImgFileList(info.fileList)}
                  showUploadList={false}
                  disabled={imgUploading || !isMgr}
                >
                  <Button loading={imgUploading} disabled={!isMgr}>
                    上传图片
                  </Button>
                </Upload>
              </div>
            </div>

            <Divider style={{ margin: "8px 0" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <Typography.Text strong>已读统计</Typography.Text>
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
                  {readsSummary ?? "打开后加载"}
                </div>
              </div>
              <Button
                disabled={!isMgr}
                onClick={() => {
                  setReadsOpen(true);
                  void loadReads();
                }}
              >
                查看名单
              </Button>
            </div>
          </Space>
        </Card>
      ) : null}

      <Modal
        title="已读名单"
        open={readsOpen}
        onCancel={() => setReadsOpen(false)}
        footer={[
          <Button key="close" onClick={() => setReadsOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            {readLoading ? "加载中…" : `${readUsers.length} 已读 / ${unreadUsers.length} 未读`}
          </Typography.Text>
          <Divider style={{ margin: "8px 0" }} />
          <Typography.Text strong>已读</Typography.Text>
          <div
            style={{
              maxHeight: 220,
              overflow: "auto",
              border: `1px solid ${token.colorBorder}`,
              borderRadius: 8,
              padding: 8,
            }}
          >
            {readUsers.length === 0 ? (
              <Typography.Text type="secondary">无</Typography.Text>
            ) : (
              readUsers.map((u) => (
                <div key={u.id} style={{ padding: "4px 0" }}>
                  {u.displayName}（{u.username}）
                </div>
              ))
            )}
          </div>
          <Typography.Text strong style={{ marginTop: 8 }}>
            未读
          </Typography.Text>
          <div
            style={{
              maxHeight: 220,
              overflow: "auto",
              border: `1px solid ${token.colorBorder}`,
              borderRadius: 8,
              padding: 8,
            }}
          >
            {unreadUsers.length === 0 ? (
              <Typography.Text type="secondary">无</Typography.Text>
            ) : (
              unreadUsers.map((u) => (
                <div key={u.id} style={{ padding: "4px 0" }}>
                  {u.displayName}（{u.username}）
                </div>
              ))
            )}
          </div>
        </Space>
      </Modal>
    </Space>
  );
}

