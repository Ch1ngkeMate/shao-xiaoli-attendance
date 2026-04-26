import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@/generated/prisma/client";

const SESSION_COOKIE = "sxlat_session";

/** 是否对会话 Cookie 使用 Secure（仅 HTTPS 发送）。生产环境默认为 true；未上证书前用 HTTP+IP 调试时可设 SESSION_COOKIE_SECURE=false */
function sessionCookieSecure(): boolean {
  const v = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return process.env.NODE_ENV === "production";
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("缺少环境变量 AUTH_SECRET");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // userId
  role: UserRole;
  displayName: string;
  username: string;
};

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getAuthSecret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function hasRole(role: UserRole, allowed: UserRole[]) {
  return allowed.includes(role);
}

