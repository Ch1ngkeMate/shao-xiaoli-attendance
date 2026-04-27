import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "sxlat_session";

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
  // 登录页等未带会话时也要能加载 public 下的 Logo
  if (pathname === "/dept-logo.png" || pathname === "/dept-logo.svg") return true;
  return false;
}

function decodeJwtPayloadRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const role = decodeJwtPayloadRole(token);
  if (!role) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const isAdminArea = pathname.startsWith("/admin");
  /** 与 AppShell 中「管理人员」菜单一致：部员考勤仅部长/管理员可进，须与 /api/attendance 校验一致 */
  const isMinisterArea =
    pathname.startsWith("/publish") || pathname.startsWith("/reports") || pathname.startsWith("/attendance");
  if (isAdminArea && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (isMinisterArea && role !== "ADMIN" && role !== "MINISTER") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // 不上传鉴权：/uploads 下为本地存储的公开静态资源（文件名随机）；避免部分环境对图片请求未带 Cookie 时被重定向导致裂图、Upload 卡死
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};

