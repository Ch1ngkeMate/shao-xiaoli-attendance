"""
会议与值班管理
"""

from typing import Optional
from .client import KaoqinClient


# ─── 会议 ──────────────────────────────────────────

def list_meetings(client: KaoqinClient) -> list[dict]:
    """获取会议列表"""
    data = client._get("/api/meetings")
    return data.get("meetings", [])


def get_meeting(client: KaoqinClient, meeting_id: str) -> dict:
    """获取会议详情"""
    return client._get(f"/api/meetings/{meeting_id}")


def create_meeting(client: KaoqinClient, title: str, start_time: str,
                   end_time: str = None, place: str = None,
                   description: str = None, check_in_place: str = None,
                   check_in_lat: float = None, check_in_lng: float = None,
                   check_in_radius: int = 150) -> dict:
    """创建新会议"""
    body = {
        "title": title,
        "startTime": start_time,
    }
    if end_time:
        body["endTime"] = end_time
    if place:
        body["place"] = place
    if description:
        body["description"] = description
    if check_in_place:
        body["checkInPlace"] = check_in_place
    if check_in_lat is not None and check_in_lng is not None:
        body["checkInLat"] = check_in_lat
        body["checkInLng"] = check_in_lng
        body["checkInRadius"] = check_in_radius

    return client._post("/api/meetings", body)


def end_meeting(client: KaoqinClient, meeting_id: str) -> dict:
    """结束会议"""
    return client._post(f"/api/meetings/{meeting_id}/end")


def delete_meeting(client: KaoqinClient, meeting_id: str) -> dict:
    """删除会议"""
    return client._delete(f"/api/admin/meetings/{meeting_id}")


def bulk_delete_meetings(client: KaoqinClient, meeting_ids: list[str]) -> dict:
    """批量删除会议"""
    return client._post("/api/admin/meetings/bulk-delete", {"ids": meeting_ids})


# ─── 值班 ──────────────────────────────────────────

def list_duty(client: KaoqinClient) -> list[dict]:
    """获取值班安排"""
    data = client._get("/api/duty")
    return data.get("assignments", [])


def create_duty(client: KaoqinClient, weekday: int, period: int,
                user_id: str, dept_label: str = None) -> dict:
    """安排值班

    参数:
        weekday: 0=周一 ~ 4=周五
        period: 0=第一节 ~ 4=第五节
        user_id: 用户ID
        dept_label: 部门标签（如"办公室"）
    """
    body = {
        "weekday": weekday,
        "period": period,
        "userId": user_id,
    }
    if dept_label:
        body["deptLabel"] = dept_label
    return client._post("/api/duty", body)


def delete_duty(client: KaoqinClient, duty_id: str) -> dict:
    """删除值班安排"""
    return client._delete(f"/api/duty/{duty_id}")


# ─── 格式化输出 ────────────────────────────────────

WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五"]
PERIOD_NAMES = ["第一节", "第二节", "第三节", "第四节", "第五节"]


def format_meeting_list(meetings: list[dict]) -> str:
    """格式化会议列表"""
    if not meetings:
        return "暂无会议"

    lines = [f"共 {len(meetings)} 个会议：", ""]
    for m in meetings:
        status = "进行中" if m.get("status") == "OPEN" else "已结束"
        lines.append(
            f"  [{status}] {m.get('title', '')}"
        )
        lines.append(f"    时间: {m.get('startTime', '')} ~ {m.get('endTime', '?')}")
        lines.append(f"    地点: {m.get('place', '未指定')}")
        if m.get("checkInPlace"):
            lines.append(f"    签到点: {m.get('checkInPlace')}")
        lines.append("")
    return "\n".join(lines)


def format_duty_list(assignments: list[dict]) -> str:
    """格式化值班表（按周一到周五、第一节到第五节排列）"""
    if not assignments:
        return "暂无值班安排"

    # 构建 5x5 表格
    grid = [[[] for _ in range(5)] for _ in range(5)]  # grid[weekday][period]
    for a in assignments:
        w = a.get("weekday", 0)
        p = a.get("period", 0)
        if 0 <= w < 5 and 0 <= p < 5:
            name = a.get("user", {}).get("displayName", "?")
            dept = a.get("deptLabel", "")
            label = f"{name}({dept})" if dept else name
            grid[w][p].append(label)

    lines = []
    header = "          " + "  ".join(f"{p:<14}" for p in PERIOD_NAMES)
    lines.append(header)
    lines.append("-" * 90)

    for w in range(5):
        row_parts = []
        for p in range(5):
            cell = "\n".join(grid[w][p]) if grid[w][p] else "—"
            row_parts.append(f"{cell:<14}")
        lines.append(f"{WEEKDAY_NAMES[w]:<10}" + "  ".join(row_parts))

    return "\n".join(lines)
