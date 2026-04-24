import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "sxlat_session";

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;
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
  const isMinisterArea = pathname.startsWith("/publish") || pathname.startsWith("/reports");
  if (isAdminArea && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (isMinisterArea && role !== "ADMIN" && role !== "MINISTER") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

