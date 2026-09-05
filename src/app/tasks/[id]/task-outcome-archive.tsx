"use client";

import { DeleteOutlined, FilePdfOutlined, LinkOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Image, Input, Modal, Space, Typography, message } from "antd";
import { useRef, useState } from "react";

type Asset = { id: string; kind: "IMAGE" | "VIDEO" | "DOCUMENT"; url: string; filename: string; mimeType: string; sizeBytes: number | null; createdAt: string; uploadedBy: { id: string; displayName: string } };
type Outcome = { id: string; summary: string | null; externalUrl: string | null; externalLabel: string | null; updatedAt: string; updatedBy: { id: string; displayName: string }; assets: Asset[] } | null;
type Props = { taskId: string; outcome: Outcome; canUpload: boolean; canManage: boolean; currentUserId: string };

function sizeText(bytes: number | null) { if (bytes == null) return ""; return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export default function TaskOutcomeArchive({ taskId, outcome: initial, canUpload, canManage, currentUserId }: Props) {
  const [outcome, setOutcome] = useState<Outcome>(initial);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl ?? "");
  const [externalLabel, setExternalLabel] = useState(initial?.externalLabel ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file);
        const res = await fetch(`/api/tasks/${taskId}/outcome/assets`, { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `${file.name} 上传失败`);
        setOutcome((old) => old ? { ...old, assets: [...old.assets, data.asset] } : { id: "new", summary: null, externalUrl: null, externalLabel: null, updatedAt: new Date().toISOString(), updatedBy: { id: currentUserId, displayName: "我" }, assets: [data.asset] });
      }
      message.success("成果材料已归档，所有成员现在都可以查看");
    } catch (error) { message.error(error instanceof Error ? error.message : "上传失败"); }
    finally { setSaving(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function saveMeta() {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/outcome`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary: summary || null, externalUrl: externalUrl || null, externalLabel: externalLabel || null }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || "保存失败");
      setOutcome(data.outcome); setEditing(false); message.success("成果说明已保存");
    } catch (error) { message.error(error instanceof Error ? error.message : "保存失败"); } finally { setSaving(false); }
  }
  async function remove(asset: Asset) {
    const res = await fetch(`/api/tasks/${taskId}/outcome/assets/${asset.id}`, { method: "DELETE" }); const data = await res.json().catch(() => ({}));
    if (!res.ok) { message.error(data.message || "删除失败"); return; }
    setOutcome((old) => old ? { ...old, assets: old.assets.filter((x) => x.id !== asset.id) } : old); message.success("已移出成果档案");
  }
  const assets = outcome?.assets ?? []; const images = assets.filter((a) => a.kind === "IMAGE"); const videos = assets.filter((a) => a.kind === "VIDEO"); const documents = assets.filter((a) => a.kind === "DOCUMENT");
  return <Card title="成果档案" extra={<Space>{canUpload && <><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf" onChange={(e) => void upload(e.target.files)} style={{ display: "none" }} /><Button icon={<UploadOutlined />} loading={saving} onClick={() => inputRef.current?.click()}>归档材料</Button></>}{canManage && <Button onClick={() => setEditing(true)}>编辑说明</Button>}</Space>}>
    <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>任务完成后沉淀的照片、视频、PDF 与成品链接；所有已登录成员均可查看。</Typography.Paragraph>
    {outcome?.summary && <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{outcome.summary}</Typography.Paragraph>}
    {outcome?.externalUrl && <Typography.Paragraph><a href={outcome.externalUrl} target="_blank" rel="noreferrer"><LinkOutlined /> {outcome.externalLabel || "查看对外成果"}</a></Typography.Paragraph>}
    {!outcome && !canUpload && <Typography.Text type="secondary">暂未归档成果材料。</Typography.Text>}
    {images.length > 0 && <><Typography.Text strong>照片</Typography.Text><Image.PreviewGroup><div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>{images.map((a) => <div key={a.id} style={{ position: "relative" }}><Image src={a.url} alt={a.filename} width={120} height={90} style={{ objectFit: "cover", borderRadius: 6 }} /><AssetMeta asset={a} removable={canManage || a.uploadedBy.id === currentUserId} onRemove={remove} /></div>)}</div></Image.PreviewGroup></>}
    {videos.length > 0 && <div style={{ marginTop: images.length ? 18 : 0 }}><Typography.Text strong>视频</Typography.Text><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>{videos.map((a) => <div key={a.id}><video controls preload="metadata" style={{ width: "100%", borderRadius: 6, background: "#000" }}><source src={a.url} type={a.mimeType} /></video><AssetMeta asset={a} removable={canManage || a.uploadedBy.id === currentUserId} onRemove={remove} /></div>)}</div></div>}
    {documents.length > 0 && <div style={{ marginTop: (images.length || videos.length) ? 18 : 0 }}><Typography.Text strong>文档</Typography.Text><Space direction="vertical" style={{ display: "flex", marginTop: 8 }}>{documents.map((a) => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><a href={a.url} target="_blank" rel="noreferrer"><FilePdfOutlined /> {a.filename}</a><Space><Typography.Text type="secondary">{sizeText(a.sizeBytes)} · {a.uploadedBy.displayName}</Typography.Text>{(canManage || a.uploadedBy.id === currentUserId) && <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => void remove(a)} />}</Space></div>)}</Space></div>}
    {outcome && <Typography.Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 12 }}>最后整理：{outcome.updatedBy.displayName} · {new Date(outcome.updatedAt).toLocaleString()}</Typography.Text>}
    <Modal title="编辑成果说明" open={editing} onCancel={() => setEditing(false)} onOk={() => void saveMeta()} confirmLoading={saving} okText="保存"><Typography.Paragraph type="secondary">链接可填写公众号推文、视频号、网盘或线上成品页面。</Typography.Paragraph><Input.TextArea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} maxLength={5000} placeholder="简要说明本任务产出了什么、使用场景和完成情况" /><Input value={externalLabel} onChange={(e) => setExternalLabel(e.target.value)} maxLength={120} placeholder="链接名称，例如：公众号推文" style={{ marginTop: 12 }} /><Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://..." style={{ marginTop: 8 }} /></Modal>
  </Card>;
}
function AssetMeta({ asset, removable, onRemove }: { asset: Asset; removable: boolean; onRemove: (a: Asset) => Promise<void> }) { return <div style={{ display: "flex", gap: 4, alignItems: "center", maxWidth: 120 }}><Typography.Text ellipsis={{ tooltip: asset.filename }} type="secondary" style={{ fontSize: 11, flex: 1 }}>{asset.filename}</Typography.Text>{removable && <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={`删除 ${asset.filename}`} onClick={() => void onRemove(asset)} />}</div>; }
