"""
用户/账号管理
"""

from typing import Optional
from .client import KaoqinClient


def list_users(client: KaoqinClient) -> list[dict]:
    """获取所有用户列表"""
    data = client._get("/api/admin/users")
    return data.get("users", [])


def get_user(client: KaoqinClient, user_id: str) -> dict:
    """获取单个用户详情"""
    return client._get(f"/api/admin/users/{user_id}")


def create_user(client: KaoqinClient, username: str, display_name: str,
                role: str = "MEMBER", password: str = "123456") -> dict:
    """创建新用户"""
    data = client._post("/api/admin/users", {
        "username": username,
        "displayName": display_name,
        "role": role,
        "password": password,
    })
    return data.get("user", data)


def update_user(client: KaoqinClient, user_id: str, **fields) -> dict:
    """更新用户信息

    fields 可选: username, displayName, role, isActive, password
    """
    return client._put(f"/api/admin/users/{user_id}", fields)


def delete_user(client: KaoqinClient, user_id: str) -> dict:
    """删除用户（不可恢复！）"""
    return client._delete(f"/api/admin/users/{user_id}")


def reset_all_passwords(client: KaoqinClient, new_password: str = "123456") -> dict:
    """重置所有用户密码"""
    return client._post("/api/admin/users/reset-all-passwords", {
        "password": new_password,
    })


def import_users(client: KaoqinClient, users: list[dict]) -> dict:
    """批量导入用户

    users 格式: [{"username": "xxx", "displayName": "某某", "role": "MEMBER"}, ...]
    """
    return client._post("/api/admin/users/import", {"users": users})


def get_assignable_users(client: KaoqinClient) -> list[dict]:
    """获取可分配的用户列表"""
    data = client._get("/api/users/assignable")
    return data.get("users", [])


# ─── 格式化输出 ────────────────────────────────────

ROLE_NAMES = {"ADMIN": "管理员", "MINISTER": "部长", "MEMBER": "部员"}


def format_user_list(users: list[dict]) -> str:
    """格式化用户列表为可读文本"""
    lines = [f"{'姓名':<10} {'账号':<16} {'角色':<6} {'状态':<6}"]
    lines.append("-" * 42)
    for u in users:
        role = ROLE_NAMES.get(u.get("role", ""), u.get("role", ""))
        status = "正常" if u.get("isActive") else "停用"
        lines.append(
            f"{u.get('displayName', ''):<10} "
            f"{u.get('username', ''):<16} "
            f"{role:<6} "
            f"{status:<6}"
        )
    return "\n".join(lines)
