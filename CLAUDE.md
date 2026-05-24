@AGENTS.md

# 图片处理规则

当用户发送图片或图片URL时，自动使用 ERNIE-4.5-Turbo-VL 解析图片，
再将文字描述交给 DeepSeek V4 进行推理。

## 工作流程

1. 用户发送图片（本地路径 / URL / 截图粘贴）或图片地址
2. 调用桥接脚本获取 ERNIE 的图片描述:
   ```
   python scripts/image-bridge.py describe -i "<图片路径>"
   ```
3. 获取 ERNIE 生成的图片文字描述
4. 基于该描述，用 DeepSeek 主思考模型进行推理和回答

## 注意

- 图片路径可能是本地文件或网络URL
- 如果是网络URL，先下载到临时文件再传入脚本
- 始终先获取ERNIE描述，再基于描述回答用户问题
- 不要跳过ERNIE直接看图回答
