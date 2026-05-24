import { cookies, headers } from "next/headers";
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

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** 签发会话 JWT（Web Cookie / 小程序 Authorization 共用） */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSessionToken(payload);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });

  return token;
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

/** 读取当前会话：优先 Cookie，其次 Authorization: Bearer（小程序） */
export async function readSessionCookie(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const cookieToken = jar.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const session = await verifySessionToken(cookieToken);
    if (session) return session;
  }

  const h = await headers();
  const auth = h.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return verifySessionToken(bearer);
  }

  return null;
}

export function hasRole(role: UserRole, allowed: UserRole[]) {
  return allowed.includes(role);
}

