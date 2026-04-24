import { NextResponse } from "next/server";
import { readSessionCookie } from "@/lib/auth";

export async function GET() {
  const session = await readSessionCookie();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: session.sub,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    },
  });
}

