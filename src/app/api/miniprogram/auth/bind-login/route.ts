import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/auth";
import { code2session } from "@/lib/wechat";

const BindLoginSchema = z.object({
  code: z.string().min(1, "缺少登录凭证 code"),
  realName: z.string().min(1, "请输入真实姓名"),
});

function sessionUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = BindLoginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? "参数错误" },
        { status: 400 },
      );
    }

    const { code, realName } = parsed.data;

    let wxSession;
    try {
      wxSession = await code2session(code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "微信接口调用失败";
      return NextResponse.json({ success: false, message: msg }, { status: 502 });
    }

    const user = await prisma.user.findFirst({
      where: { displayName: realName, isActive: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "姓名未匹配到系统账号，请检查是否输入正确" },
        { status: 404 },
      );
    }

    const existingBind = await prisma.user.findUnique({
      where: { wxOpenId: wxSession.openid },
      select: { id: true },
    });
    if (existingBind && existingBind.id !== user.id) {
      return NextResponse.json(
        { success: false, message: "该微信已绑定其他账号" },
        { status: 409 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        wxOpenId: wxSession.openid,
        wxUnionId: wxSession.unionid ?? undefined,
      },
    });

    const token = await createSessionCookie({
      sub: user.id,
      role: user.role,
      displayName: user.displayName,
      username: user.username,
    });

    return NextResponse.json({
      success: true,
      token,
      user: sessionUser(user),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "服务器内部错误";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
