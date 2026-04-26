"use client";

import Link from "next/link";
import { Avatar } from "antd";

type Role = "ADMIN" | "MINISTER" | "MEMBER";

/**
 * 部长/管理员点击头像进入「成员个人主页」；部员或非管理人员仅展示静态头像。
 */
export function AdminProfilePeekAvatar(props: {
  viewerRole: Role;
  targetUserId: string;
  size?: number;
  src?: string | null;
  displayName: string;
}) {
  const { viewerRole, targetUserId, size = 22, src, displayName } = props;
  const canPeek = viewerRole === "ADMIN" || viewerRole === "MINISTER";
  const inner = (
    <Avatar size={size} src={src || undefined} style={{ flexShrink: 0 }}>
      {displayName.slice(0, 1)}
    </Avatar>
  );
  if (!canPeek) return inner;
  return (
    <Link
      href={`/profile/${targetUserId}`}
      title="查看个人主页"
      prefetch={false}
      style={{ display: "inline-flex", lineHeight: 0, verticalAlign: "middle" }}
    >
      {inner}
    </Link>
  );
}
