"""
核心客户端：登录、Session 管理、HTTP 请求封装
"""

import os
import json
import requests
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass

BASE_URL = "https://shaoxiaoli.top"
SESSION_FILE = Path(__file__).parent.parent / ".kaoqin_session.json"


@dataclass
class User:
    """当前登录用户信息"""
    id: str
    username: str
    display_name: str
    role: str


class KaoqinClient:
    """考勤系统 API 客户端"""

    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "KaoqinCLI/1.0",
            "Content-Type": "application/json",
        })
        self._user: Optional[User] = None

    # ─── 认证 ───────────────────────────────────────

    def login(self, username: str, password: str) -> User:
        """登录并保存 session cookie"""
        resp = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password},
            timeout=15,
        )
        data = resp.json()
        if resp.status_code != 200 or not data.get("ok"):
            raise AuthError(data.get("message", "登录失败"))

        user = data["user"]
        self._user = User(
            id=user["id"],
            username=user["username"],
            display_name=user["displayName"],
            role=user["role"],
        )
        self._save_session()
        return self._user

    def logout(self):
        """退出登录"""
        try:
            self.session.post(f"{self.base_url}/api/auth/logout", timeout=10)
        except Exception:
            pass
        self._user = None
        if SESSION_FILE.exists():
            SESSION_FILE.unlink()

    def ensure_auth(self):
        """确保已登录，否则抛出异常"""
        if not self._user:
            if not self._try_restore_session():
                raise AuthError("未登录，请先调用 login()")

    # ─── Session 持久化 ─────────────────────────────

    def _save_session(self):
        cookies = self.session.cookies.get_dict()
        SESSION_FILE.write_text(json.dumps({
            "cookies": cookies,
            "user": {
                "id": self._user.id,
                "username": self._user.username,
                "display_name": self._user.display_name,
                "role": self._user.role,
            },
        }), encoding="utf-8")

    def _try_restore_session(self) -> bool:
        """尝试从文件恢复 session"""
        if not SESSION_FILE.exists():
            return False
        try:
            data = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
            for name, value in data.get("cookies", {}).items():
                self.session.cookies.set(name, value)
            u = data["user"]
            self._user = User(id=u["id"], username=u["username"],
                              display_name=u["display_name"], role=u["role"])
            # 验证 session 是否有效
            resp = self.session.get(f"{self.base_url}/api/me", timeout=10)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        self._user = None
        return False

    # ─── HTTP 请求封装 ──────────────────────────────

    def _get(self, path: str, params: dict = None) -> dict:
        self.ensure_auth()
        resp = self.session.get(
            f"{self.base_url}{path}", params=params, timeout=30
        )
        if resp.status_code == 401:
            raise AuthError("登录已过期，请重新登录")
        if resp.status_code == 403:
            raise PermissionError("无权限执行此操作")
        data = resp.json()
        if resp.status_code >= 400:
            raise APIError(data.get("message", f"请求失败 ({resp.status_code})"))
        return data

    def _post(self, path: str, json_data: dict = None) -> dict:
        self.ensure_auth()
        resp = self.session.post(
            f"{self.base_url}{path}", json=json_data or {}, timeout=30
        )
        if resp.status_code == 401:
            raise AuthError("登录已过期，请重新登录")
        if resp.status_code == 403:
            raise PermissionError("无权限执行此操作")
        data = resp.json()
        if resp.status_code >= 400:
            raise APIError(data.get("message", f"请求失败 ({resp.status_code})"))
        return data

    def _put(self, path: str, json_data: dict = None) -> dict:
        self.ensure_auth()
        resp = self.session.put(
            f"{self.base_url}{path}", json=json_data or {}, timeout=30
        )
        if resp.status_code == 401:
            raise AuthError("登录已过期，请重新登录")
        if resp.status_code == 403:
            raise PermissionError("无权限执行此操作")
        data = resp.json()
        if resp.status_code >= 400:
            raise APIError(data.get("message", f"请求失败 ({resp.status_code})"))
        return data

    def _delete(self, path: str) -> dict:
        self.ensure_auth()
        resp = self.session.delete(f"{self.base_url}{path}", timeout=30)
        if resp.status_code == 401:
            raise AuthError("登录已过期，请重新登录")
        if resp.status_code == 403:
            raise PermissionError("无权限执行此操作")
        data = resp.json()
        if resp.status_code >= 400:
            raise APIError(data.get("message", f"请求失败 ({resp.status_code})"))
        return data

    @property
    def user(self) -> Optional[User]:
        return self._user


# ─── 异常 ───────────────────────────────────────────

class KaoqinError(Exception):
    """考勤系统相关异常基类"""
    pass


class AuthError(KaoqinError):
    """认证相关错误"""
    pass


class APIError(KaoqinError):
    """API 返回的错误"""
    pass
