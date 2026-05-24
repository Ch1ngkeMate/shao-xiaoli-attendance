#!/usr/bin/env python3
"""
Image Bridge — 多模态图片解析桥接脚本

使用百度 ERNIE-4.5-Turbo-VL 解析图片为文字描述,
再交由 DeepSeek V4 作为主思考模型进行推理,
从而在不影响 DeepSeek 主模型能力的前提下实现图片理解。

用法:
  # 作为 Python 模块导入
  from image_bridge import bridge_chat_completion

  # 命令行交互模式
  python image-bridge.py chat

  # 作为本地 API 代理服务
  python image-bridge.py serve --port 8899

  # 单次问答
  python image-bridge.py ask "这张图片里有什么?" --image ./photo.png

环境变量:
  ERNIE_API_KEY    百度千帆 API Key (必需)
  ERNIE_BASE_URL   百度千帆 API 地址 (默认 https://qianfan.baidubce.com/v2)
  ERNIE_MODEL      视觉模型名称 (默认 ernie-4.5-turbo-vl)
  DEEPSEEK_API_KEY DeepSeek API Key (必需)
  DEEPSEEK_BASE_URL DeepSeek API 地址 (默认 https://api.deepseek.com/v1)
  DEEPSEEK_MODEL   主思考模型名称 (默认 deepseek-chat)
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import mimetypes
import os
import sys
from pathlib import Path
from typing import Any

import httpx

# ─── 配置 ───────────────────────────────────────────────────────────

CONFIG = {
    "ernie_api_key": os.getenv(
        "ERNIE_API_KEY",
        "bce-v3/ALTAK-9qWLKGJRWLaupNrvpc5gF/7b7986547335932026841b0bc392aceea8253066",
    ),
    "ernie_base_url": os.getenv("ERNIE_BASE_URL", "https://qianfan.baidubce.com/v2"),
    "ernie_model": os.getenv("ERNIE_MODEL", "ernie-4.5-turbo-vl"),
    "deepseek_api_key": os.getenv(
        "DEEPSEEK_API_KEY",
        "sk-56319353244a4e03b37af5f8d34fd3e1",
    ),
    "deepseek_base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
    "deepseek_model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
}

# ─── 工具函数 ────────────────────────────────────────────────────────


def _encode_image_file(path: str) -> str:
    """读取本地图片文件并编码为 base64 data URL."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"图片文件不存在: {path}")
    mime, _ = mimetypes.guess_type(str(p))
    if mime is None or not mime.startswith("image/"):
        mime = "image/png"
    data = p.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _resolve_image(image_path: str) -> str:
    """
    智能解析图片为 data URL.
    - 本地文件: 读取并编码为 base64 data URL
    - HTTP/HTTPS URL: 下载后编码为 base64 data URL
    - data: URL: 原样返回
    """
    if image_path.startswith("data:"):
        return image_path
    if image_path.startswith(("http://", "https://")):
        raw = _load_image_bytes(image_path)
        mime = _guess_mime_from_bytes(raw)
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"
    # 本地文件
    return _encode_image_file(image_path)


def _guess_mime_from_bytes(data: bytes) -> str:
    """通过文件头魔数猜测图片 MIME 类型."""
    if data[:4] == b"\x89PNG":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] in (b"RIFF",) and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _image_mime_from_url(url: str) -> str:
    """从 data URL 中解析 MIME 类型, 默认 image/png."""
    if url.startswith("data:"):
        header = url.split(",")[0]
        if ":" in header:
            for part in header.split(";"):
                if "/" in part and not part.startswith("data:"):
                    return part.split(":")[-1]
    return "image/png"


def _extract_images(messages: list[dict]) -> list[tuple[int, int, str]]:
    """
    从消息列表中提取所有图片。
    返回 [(msg_index, content_index, image_url), ...].
    """
    images: list[tuple[int, int, str]] = []
    for mi, msg in enumerate(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            continue
        if isinstance(content, list):
            for ci, part in enumerate(content):
                if isinstance(part, dict) and part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url:
                        images.append((mi, ci, url))
    return images


def _load_image_bytes(url: str) -> bytes:
    """从 URL 或本地路径加载图片字节."""
    if url.startswith("data:"):
        # base64 data URL
        header_b64 = url.split(",", 1)
        if len(header_b64) != 2:
            raise ValueError(f"无效的 data URL")
        return base64.b64decode(header_b64[1])
    elif url.startswith(("http://", "https://")):
        r = httpx.get(url, follow_redirects=True, timeout=30)
        r.raise_for_status()
        return r.content
    else:
        # 本地文件路径
        return Path(url).read_bytes()


# ─── 核心: 图片描述 ──────────────────────────────────────────────────


def _describe_images(messages: list[dict]) -> dict[str, str]:
    """
    调用 ERNIE-4.5-Turbo-VL 为消息中的所有图片生成文字描述。

    返回 {image_url: description_text} 的映射。
    图片会被分批发送, 每批最多 4 张, 避免单次请求过大。
    """
    images = _extract_images(messages)
    if not images:
        return {}

    descriptions: dict[str, str] = {}

    for i, (mi, ci, url) in enumerate(images):
        mime = _image_mime_from_url(url)
        image_b64 = ""
        try:
            raw = _load_image_bytes(url)
            image_b64 = base64.b64encode(raw).decode("ascii")
        except Exception as e:
            descriptions[url] = f"[图片加载失败: {e}]"
            continue

        data_url = f"data:{mime};base64,{image_b64}"

        payload = {
            "model": CONFIG["ernie_model"],
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "请仔细观察这张图片, 用中文详细、准确地描述图片中的全部内容。"
                                "包括: 人物/物体、动作、场景、文字、数字、颜色、布局等所有可见信息。"
                                "描述应该清晰、完整, 让一个看不到图片的人也能完全理解图片内容。"
                                "直接输出描述, 不要加前缀或后缀。"
                            ),
                        },
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
            "max_tokens": 2048,
            "temperature": 0.1,
        }

        headers = {"Authorization": f"Bearer {CONFIG['ernie_api_key']}"}

        try:
            r = httpx.post(
                f"{CONFIG['ernie_base_url']}/chat/completions",
                json=payload,
                headers=headers,
                timeout=60,
            )
            r.raise_for_status()
            body = r.json()
            desc = body["choices"][0]["message"]["content"].strip()
            descriptions[url] = desc
        except Exception as e:
            descriptions[url] = f"[ERNIE 图片解析出错: {e}]"

    return descriptions


# ─── 核心: 消息重写 ──────────────────────────────────────────────────


def _rewrite_messages(
    messages: list[dict], descriptions: dict[str, str]
) -> list[dict]:
    """
    将原消息中的图片替换为 ERNIE 生成的文字描述, 返回纯文本消息列表。
    DeepSeek V4 将收到不含图片、但包含图片描述的文本。
    """
    rewritten: list[dict] = []

    for mi, msg in enumerate(messages):
        role = msg.get("role", "user")
        content = msg.get("content")

        if isinstance(content, str):
            rewritten.append(msg)
            continue

        if not isinstance(content, list):
            rewritten.append(msg)
            continue

        # 重建 content: text 保留, image_url 替换为描述文本
        new_parts: list[str] = []
        has_image = False

        for ci, part in enumerate(content):
            if isinstance(part, dict) and part.get("type") == "image_url":
                url = part.get("image_url", {}).get("url", "")
                desc = descriptions.get(url, "[图片]")
                new_parts.append(f"[图片描述: {desc}]")
                has_image = True
            elif isinstance(part, dict) and part.get("type") == "text":
                new_parts.append(part.get("text", ""))
            elif isinstance(part, str):
                new_parts.append(part)

        if has_image:
            new_parts.insert(
                0,
                "[系统提示: 以下内容中包含图片的AI自动描述, 请基于这些描述来理解和回答用户的问题。]\n\n",
            )

        rewritten.append({"role": role, "content": "\n".join(new_parts)})

    return rewritten


# ─── 核心: 桥接调用 ──────────────────────────────────────────────────


def bridge_chat_completion(
    messages: list[dict],
    *,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
    stream: bool = False,
    extra_body: dict | None = None,
) -> dict | httpx.Response:
    """
    一键桥接: 图片 → ERNIE 描述 → DeepSeek V4 推理。

    参数:
      messages: OpenAI 格式的消息列表, 可包含 image_url 类型的 content。
      system: 系统提示词 (可选)。
      temperature: DeepSeek 采样温度。
      max_tokens: DeepSeek 最大输出 token 数。
      stream: 是否流式输出。
      extra_body: 传递给 DeepSeek API 的额外参数。

    返回:
      非流式: dict (OpenAI chat completion 格式)
      流式:   httpx.Response (需自行消费 iter_lines)
    """
    # Step 1: 用 ERNIE 描述所有图片
    descriptions = _describe_images(messages)

    # Step 2: 重写消息, 用文字描述替换图片
    clean_messages = _rewrite_messages(messages, descriptions)

    # Step 3: 添加 system prompt
    full_messages: list[dict] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(clean_messages)

    # Step 4: 调用 DeepSeek V4
    payload: dict[str, Any] = {
        "model": CONFIG["deepseek_model"],
        "messages": full_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if extra_body:
        payload.update(extra_body)

    headers = {
        "Authorization": f"Bearer {CONFIG['deepseek_api_key']}",
        "Content-Type": "application/json",
    }

    if stream:
        return httpx.post(
            f"{CONFIG['deepseek_base_url']}/chat/completions",
            json=payload,
            headers=headers,
            timeout=120,
        )

    r = httpx.post(
        f"{CONFIG['deepseek_base_url']}/chat/completions",
        json=payload,
        headers=headers,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


# ─── 流式辅助 ────────────────────────────────────────────────────────


def bridge_chat_completion_stream(messages, **kwargs):
    """流式版本 — 返回生成器, 逐条 yield JSON chunk."""

    kwargs["stream"] = True
    response = bridge_chat_completion(messages, **kwargs)

    for line in response.iter_lines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("data: "):
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                yield json.loads(data)
            except json.JSONDecodeError:
                continue


# ─── HTTP 代理服务器 ──────────────────────────────────────────────────


def _run_server(host: str, port: int):
    """启动一个兼容 OpenAI API 格式的本地代理服务."""
    try:
        import uvicorn  # type: ignore
    except ImportError:
        print("需要安装 uvicorn: pip install uvicorn")
        sys.exit(1)

    try:
        from starlette.applications import Starlette  # type: ignore
        from starlette.requests import Request  # type: ignore
        from starlette.responses import JSONResponse, StreamingResponse  # type: ignore
        from starlette.routing import Route  # type: ignore
    except ImportError:
        print("需要安装 starlette: pip install starlette")
        sys.exit(1)

    async def chat_completions(request: Request):
        body = await request.json()
        messages = body.get("messages", [])
        stream = body.get("stream", False)
        system = None

        # 提取 system 消息
        if messages and messages[0].get("role") == "system":
            system = messages[0]["content"]
            messages = messages[1:]

        temperature = body.get("temperature", 0.7)
        max_tokens = body.get("max_tokens", 4096)

        if stream:

            async def generate():
                for chunk in bridge_chat_completion_stream(
                    messages,
                    system=system,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")

        result = bridge_chat_completion(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        return JSONResponse(result)

    async def health(_request: Request):
        return JSONResponse({"status": "ok", "bridge": "ERNIE → DeepSeek V4"})

    app = Starlette(
        routes=[
            Route("/v1/chat/completions", chat_completions, methods=["POST"]),
            Route("/chat/completions", chat_completions, methods=["POST"]),
            Route("/health", health, methods=["GET"]),
            Route("/", health, methods=["GET"]),
        ]
    )

    print(f"  Image Bridge 代理服务启动: http://{host}:{port}")
    print(f"  ERNIE 视觉模型: {CONFIG['ernie_model']}")
    print(f"  DeepSeek 主模型: {CONFIG['deepseek_model']}")
    print(f"  端点: POST http://{host}:{port}/v1/chat/completions")
    uvicorn.run(app, host=host, port=port, log_level="info")


# ─── CLI ─────────────────────────────────────────────────────────────


def cmd_chat():
    """交互式对话模式."""
    print("═" * 50)
    print("Image Bridge — ERNIE 看图 + DeepSeek V4 思考")
    print("输入消息 (可用 !image <path> 附加图片, !quit 退出)")
    print("═" * 50)

    messages: list[dict] = []

    while True:
        try:
            user_input = input("\n▸ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n退出.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("!quit", "!exit", "!q"):
            break

        # 处理图片附加命令
        content: list[dict] = []
        parts = user_input.split()
        text_parts: list[str] = []
        images_loaded = 0

        i = 0
        while i < len(parts):
            if parts[i] == "!image" and i + 1 < len(parts):
                try:
                    data_url = _resolve_image(parts[i + 1])
                    content.append(
                        {"type": "image_url", "image_url": {"url": data_url}}
                    )
                    images_loaded += 1
                except Exception as e:
                    print(f"  ⚠ {e}")
                i += 2
            else:
                text_parts.append(parts[i])
                i += 1

        text = " ".join(text_parts)
        if text:
            content.insert(0, {"type": "text", "text": text})

        if not content:
            continue

        messages.append({"role": "user", "content": content})

        print(f"  (解析 {images_loaded} 张图片, 调用 ERNIE 描述...)")
        try:
            result = bridge_chat_completion(messages, temperature=0.7)

            if isinstance(result, dict):
                reply = result["choices"][0]["message"]["content"]
                print(f"\n  🤖 {reply}")
                messages.append({"role": "assistant", "content": reply})
            else:
                print(f"  ✗ 调用失败: {result.status_code}")
        except Exception as e:
            print(f"  ✗ 错误: {e}")


def cmd_ask(args):
    """单次问答."""
    content: list[dict] = []

    if args.image:
        for img_path in args.image:
            try:
                data_url = _resolve_image(img_path)
                content.append({"type": "image_url", "image_url": {"url": data_url}})
            except Exception as e:
                print(f"⚠ {e}")
                sys.exit(1)

    content.append({"type": "text", "text": args.question})
    messages = [{"role": "user", "content": content}]

    print("(正在调用 ERNIE 解析图片, 再由 DeepSeek V4 推理...)")
    try:
        result = bridge_chat_completion(messages, temperature=0.7)
        if isinstance(result, dict):
            print(result["choices"][0]["message"]["content"])
        else:
            print(f"调用失败: HTTP {result.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"错误: {e}")
        sys.exit(1)


def cmd_serve(args):
    """启动 HTTP 代理服务."""
    _run_server(args.host, args.port)


def cmd_describe(args):
    """仅调用 ERNIE 描述图片 (调试用)."""
    for img_path in args.image:
        data_url = _resolve_image(img_path)
        messages = [
            {
                "role": "user",
                "content": [{"type": "image_url", "image_url": {"url": data_url}}],
            }
        ]
        descs = _describe_images(messages)
        for url, desc in descs.items():
            print(f"图片: {img_path}")
            print(f"描述: {desc}")
            print("-" * 40)


def main():
    parser = argparse.ArgumentParser(
        description="Image Bridge — ERNIE 看图 + DeepSeek V4 思考",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", help="子命令")

    # chat
    sub.add_parser("chat", help="交互式对话模式")

    # ask
    p_ask = sub.add_parser("ask", help="单次问答")
    p_ask.add_argument("question", help="问题文本")
    p_ask.add_argument("--image", "-i", action="append", help="图片路径 (可多次指定)")

    # serve
    p_serve = sub.add_parser("serve", help="启动 HTTP 代理服务")
    p_serve.add_argument("--host", default="127.0.0.1", help="监听地址 (默认 127.0.0.1)")
    p_serve.add_argument("--port", type=int, default=8899, help="监听端口 (默认 8899)")

    # describe
    p_desc = sub.add_parser("describe", help="仅用 ERNIE 描述图片 (调试)")
    p_desc.add_argument("--image", "-i", required=True, action="append", help="图片路径")

    args = parser.parse_args()

    if args.command == "chat":
        cmd_chat()
    elif args.command == "ask":
        cmd_ask(args)
    elif args.command == "serve":
        cmd_serve(args)
    elif args.command == "describe":
        cmd_describe(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
