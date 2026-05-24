import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signSessionToken } from "@/lib/auth";
import { code2session } from "@/lib/wechat";

const WxLoginSchema = z.object({
  code: z.string().min(1, "缺少登录凭证 code"),
});

/** 已绑定 openid 的用户：仅凭 wx.login 的 code 登录 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = WxLoginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message ?? "参数错误" },
        { status: 400 },
      );
    }

    let wxSession;
    try {
      wxSession = await code2session(parsed.data.code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "微信接口调用失败";
      return NextResponse.json({ success: false, message: msg }, { status: 502 });
    }

    const user = await prisma.user.findUnique({
      where: { wxOpenId: wxSession.openid },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { success: false, message: "尚未绑定账号，请使用姓名完成首次绑定" },
        { status: 404 },
      );
    }

    if (wxSession.unionid && user.wxUnionId !== wxSession.unionid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { wxUnionId: wxSession.unionid },
      });
    }

    const token = await signSessionToken({
      sub: user.id,
      role: user.role,
      displayName: user.displayName,
      username: user.username,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "服务器内部错误";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
