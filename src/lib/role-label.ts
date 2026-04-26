import type { UserRole } from "@/generated/prisma/client";

export function userRoleLabel(role: UserRole | string | undefined | null): string {
  if (role === "ADMIN" || role === "管理员") return "管理员";
  if (role === "MINISTER" || role === "部长") return "部长";
  if (role === "MEMBER" || role === "部员" || role === "干事") return "部员";
  return role ? String(role) : "";
}
