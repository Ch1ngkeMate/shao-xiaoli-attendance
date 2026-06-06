"""
考勤统计
"""

from datetime import datetime
from .client import KaoqinClient


def get_attendance(client: KaoqinClient, month: str = None) -> dict:
    """获取月份考勤统计

    参数:
        month: 月份，格式 YYYY-MM，默认当前月
    """
    if month is None:
        month = datetime.now().strftime("%Y-%m")
    return client._get("/api/attendance", {"month": month})


def get_my_attendance(client: KaoqinClient) -> dict:
    """获取当前用户的考勤记录"""
    return client._get("/api/me/attendance")


# ─── 格式化输出 ────────────────────────────────────

ROLE_NAMES = {"ADMIN": "管理员", "MINISTER": "部长", "MEMBER": "部员"}


def format_attendance(data: dict) -> str:
    """格式化考勤统计"""
    stats = data.get("stats", data)
    month = stats.get("month", "未知月份")
    people = stats.get("people", [])

    lines = [
        f"月度考勤统计 - {month}",
        f"生成时间: {stats.get('generatedAt', '未知')}",
        "",
        f"{'姓名':<10} {'账号':<14} {'角色':<6} {'接取':<4} {'提交':<4} {'确认':<4} {'总分':<5}",
        "-" * 65,
    ]
    for p in people:
        role = ROLE_NAMES.get(p.get("role", ""), p.get("role", ""))
        lines.append(
            f"{p.get('displayName', ''):<10} "
            f"{p.get('username', ''):<14} "
            f"{role:<6} "
            f"{p.get('claimCount', 0):<4} "
            f"{p.get('submitCount', 0):<4} "
            f"{p.get('approvedCount', 0):<4} "
            f"{p.get('totalPoints', 0):<5}"
        )

    # 统计汇总
    total_people = len(people)
    active_people = sum(1 for p in people if (p.get("totalPoints") or 0) > 0)
    lines.append("")
    lines.append(f"总人数: {total_people}，活跃人数: {active_people}")

    return "\n".join(lines)


def format_attendance_short(data: dict) -> str:
    """格式化考勤统计（简洁版，只显示有分的）"""
    stats = data.get("stats", data)
    people = stats.get("people", [])
    active = [p for p in people if (p.get("totalPoints") or 0) > 0]

    if not active:
        return f"本月（{stats.get('month', '?')}）暂无活跃记录"

    lines = [
        f"本月有积分记录的人员（共 {len(active)} 人）：",
        "",
    ]
    for p in sorted(active, key=lambda x: x.get("totalPoints", 0), reverse=True):
        lines.append(
            f"  {p.get('displayName', '')}（{p.get('username', '')}）: "
            f"接取{p.get('claimCount', 0)} / 提交{p.get('submitCount', 0)} / "
            f"确认{p.get('approvedCount', 0)} | 总分: {p.get('totalPoints', 0)}"
        )
    return "\n".join(lines)
