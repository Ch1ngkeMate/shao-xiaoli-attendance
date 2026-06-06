"""
任务管理：查看、发布、删除、关闭任务
"""

from typing import Optional
from .client import KaoqinClient


def list_tasks(client: KaoqinClient, *, q: str = None, status: str = None,
               ended: str = None, sort: str = None, visibility: str = None,
               page: int = 1) -> dict:
    """获取任务列表

    参数:
        q: 搜索关键词
        status: OPEN / CLOSED
        ended: true / false (是否已过截止时间)
        sort: createdDesc / endTimeAsc
        visibility: CLAIMABLE / FULL / PENDING / ENDED
        page: 页码(从1开始)
    """
    params = {}
    if q:
        params["q"] = q
    if status:
        params["status"] = status
    if ended:
        params["ended"] = ended
    if sort:
        params["sort"] = sort
    if visibility:
        params["visibility"] = visibility

    data = client._get("/api/tasks", params)
    tasks = data.get("tasks", [])

    # 简单分页（每页20条）
    per_page = 20
    start = (page - 1) * per_page
    end = start + per_page
    page_tasks = tasks[start:end]

    return {
        "tasks": page_tasks,
        "total": len(tasks),
        "page": page,
        "total_pages": max(1, (len(tasks) + per_page - 1) // per_page),
    }


def get_task(client: KaoqinClient, task_id: str) -> dict:
    """获取任务详情"""
    return client._get(f"/api/tasks/{task_id}")


def create_task(client: KaoqinClient, title: str, start_time: str, end_time: str,
                points: int = 1, description: str = None,
                headcount: int = None, image_urls: list = None) -> dict:
    """发布新任务

    参数:
        title: 任务标题
        start_time: 开始时间 (ISO格式字符串)
        end_time: 结束时间 (ISO格式字符串)
        points: 积分数
        description: 任务描述
        headcount: 人数上限
        image_urls: 图片URL列表
    """
    body = {
        "title": title,
        "startTime": start_time,
        "endTime": end_time,
        "points": points,
    }
    if description:
        body["description"] = description
    if headcount:
        body["headcountHint"] = headcount
    if image_urls:
        body["imageUrls"] = image_urls

    return client._post("/api/tasks", body)


def delete_task(client: KaoqinClient, task_id: str) -> dict:
    """删除任务"""
    return client._delete(f"/api/admin/tasks/{task_id}")


def bulk_delete_tasks(client: KaoqinClient, task_ids: list[str]) -> dict:
    """批量删除任务（不可恢复！）"""
    return client._post("/api/admin/tasks/bulk-delete", {"ids": task_ids})


def close_task(client: KaoqinClient, task_id: str) -> dict:
    """关闭任务（提前结束）"""
    return client._post(f"/api/tasks/{task_id}/close")


def get_task_submissions(client: KaoqinClient, task_id: str) -> dict:
    """获取任务提交记录"""
    return client._get(f"/api/tasks/{task_id}/submissions")


def review_submission(client: KaoqinClient, submission_id: str,
                      result: str, reason: str = None) -> dict:
    """审核提交记录

    result: APPROVED / REJECTED
    """
    body = {"result": result}
    if reason:
        body["reason"] = reason
    return client._post(f"/api/submissions/{submission_id}/review", body)


# ─── 格式化输出 ────────────────────────────────────

def format_task_list(result: dict) -> str:
    """格式化任务列表"""
    tasks = result["tasks"]
    total = result["total"]
    lines = [
        f"共 {total} 个任务（第 {result['page']}/{result['total_pages']} 页）",
        f"{'标题':<20} {'状态':<8} {'时间':<35} {'接取人':<15} {'积分':<5}",
        "-" * 90,
    ]
    for t in tasks:
        title = t.get("title", "")[:18]
        status = "已结束" if t.get("status") == "CLOSED" else "进行中"
        time_str = f"{t.get('startTime', '')} ~ {t.get('endTime', '')}"[:33]
        claimants = ", ".join(
            c.get("displayName", "") for c in t.get("claimants", [])[:3]
        ) or "无"
        points = t.get("points", 0)
        lines.append(
            f"{title:<20} {status:<8} {time_str:<35} {claimants:<15} {points:<5}"
        )
    return "\n".join(lines)
