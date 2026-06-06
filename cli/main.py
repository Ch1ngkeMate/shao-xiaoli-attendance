#!/usr/bin/env python3
"""
考勤系统 CLI 管理工具 — 入口模块
===============================
提供一键获取客户端实例，自动登录。

凭据通过环境变量设置，不在代码中存储密码：
  export KAOQIN_USERNAME="admin"
  export KAOQIN_PASSWORD="你的密码"
"""

import os
import sys
from kaoqin.client import KaoqinClient, KaoqinError, AuthError, APIError

# 全局客户端实例
_client: KaoqinClient = None


def get_client(username: str = None, password: str = None) -> KaoqinClient:
    """获取已登录的客户端实例（单例，自动登录）

    凭据优先级：
    1. 函数参数 username/password
    2. 环境变量 KAOQIN_USERNAME / KAOQIN_PASSWORD
    3. 若都没有，交互式询问
    """
    global _client
    if _client is None or _client.user is None:
        _client = KaoqinClient()
        uname = username or os.getenv("KAOQIN_USERNAME")
        pwd = password or os.getenv("KAOQIN_PASSWORD")

        if not uname or not pwd:
            print("错误：未设置登录凭据。请通过以下方式之一提供：", file=sys.stderr)
            print("  1. 环境变量: export KAOQIN_USERNAME=admin", file=sys.stderr)
            print("  2. 环境变量: export KAOQIN_PASSWORD=你的密码", file=sys.stderr)
            print("  3. 函数参数: get_client(username='admin', password='xxx')", file=sys.stderr)
            raise AuthError("缺少登录凭据，请设置 KAOQIN_USERNAME 和 KAOQIN_PASSWORD 环境变量")

        _client.login(uname, pwd)
    return _client
