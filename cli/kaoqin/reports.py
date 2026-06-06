"""
月报与导出
"""

from datetime import datetime
from .client import KaoqinClient


def get_monthly_report(client: KaoqinClient, month: str = None) -> dict:
    """获取月度报表"""
    if month is None:
        month = datetime.now().strftime("%Y-%m")
    return client._get("/api/reports/monthly", {"month": month})


def generate_report_snapshot(client: KaoqinClient, month: str) -> dict:
    """生成月度报表快照（归档当月数据）"""
    return client._post("/api/reports/monthly/generate", {"month": month})


def export_monthly_report(client: KaoqinClient, month: str) -> bytes:
    """导出月度报表为 Excel 文件，返回二进制内容"""
    client.ensure_auth()
    resp = client.session.get(
        f"{client.base_url}/api/reports/monthly/export?month={month}",
        timeout=60,
    )
    if resp.status_code >= 400:
        raise Exception(f"导出失败: {resp.status_code}")
    return resp.content


def export_attendance_range(client: KaoqinClient, start_date: str,
                            end_date: str) -> bytes:
    """导出指定日期范围的考勤 Excel（双表）"""
    client.ensure_auth()
    resp = client.session.get(
        f"{client.base_url}/api/reports/attendance-range-export",
        params={"start": start_date, "end": end_date},
        timeout=60,
    )
    if resp.status_code >= 400:
        raise Exception(f"导出失败: {resp.status_code}")
    return resp.content


# ─── 格式化输出 ────────────────────────────────────

ROLE_NAMES = {"ADMIN": "管理员", "MINISTER": "部长", "MEMBER": "部员"}


def format_monthly_report(data: dict) -> str:
    """格式化月度报表"""
    stats = data.get("stats", data)
    month = stats.get("month", "未知月份")
    people = stats.get("people", [])

    lines = [
        f"月度考勤报表 - {month}",
        f"生成时间: {stats.get('generatedAt', '未知')}",
        "",
        f"{'姓名':<10} {'账号':<14} {'接取':<4} {'提交':<4} {'确认':<4} {'任务分':<5} {'其他':<4} {'合计':<4}",
        "-" * 65,
    ]
    for p in people:
        lines.append(
            f"{p.get('displayName', ''):<10} "
            f"{p.get('username', ''):<14} "
            f"{p.get('claimCount', 0):<4} "
            f"{p.get('submitCount', 0):<4} "
            f"{p.get('approvedCount', 0):<4} "
            f"{p.get('approvedPoints', 0):<5} "
            f"{p.get('otherPoints', 0):<4} "
            f"{p.get('totalPoints', 0):<4}"
        )
    return "\n".join(lines)
