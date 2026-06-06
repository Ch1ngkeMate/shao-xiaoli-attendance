"""
请假管理
"""

from .client import KaoqinClient


def list_leaves(client: KaoqinClient) -> list[dict]:
    """获取请假列表"""
    data = client._get("/api/leave")
    return data.get("leaves", [])


def decide_leave(client: KaoqinClient, leave_id: str, decision: str,
                 reason: str = None) -> dict:
    """审批请假

    decision: APPROVED / REJECTED
    """
    body = {"decision": decision}
    if reason:
        body["reason"] = reason
    return client._post(f"/api/leave/{leave_id}/decide", body)


# ─── 格式化输出 ────────────────────────────────────

LEAVE_CATEGORY = {"DUTY": "值班请假", "MEETING": "会议请假"}
LEAVE_STATUS = {"PENDING": "待审批", "APPROVED": "已通过", "REJECTED": "已拒绝"}


def format_leave_list(leaves: list[dict]) -> str:
    """格式化请假列表"""
    if not leaves:
        return "暂无请假申请"

    lines = [f"共 {len(leaves)} 条请假申请：", ""]
    for l in leaves:
        user = l.get("user", {})
        status = LEAVE_STATUS.get(l.get("status", ""), l.get("status", ""))
        category = LEAVE_CATEGORY.get(l.get("category", ""), l.get("category", ""))
        lines.append(
            f"  [{status}] {user.get('displayName', '?')}（{user.get('username', '?')}）"
        )
        lines.append(f"    类型: {category}")
        lines.append(f"    原因: {l.get('reason', '无')}")
        lines.append(f"    申请时间: {l.get('createdAt', '?')}")
        lines.append("")
    return "\n".join(lines)
