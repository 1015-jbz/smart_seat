#!/bin/bash
# ============================================================
# 智能座舱项目 — 龙芯平台启动脚本
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 激活虚拟环境
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
else
    echo "错误：虚拟环境不存在，请先运行 setup_loongson.sh"
    exit 1
fi

# 打印环境信息
echo "=============================================="
echo "  智能座舱多模态交互终端 - 启动中"
echo "  Python: $(python --version)"
echo "  平台: $(uname -m)"
echo "=============================================="
echo ""

# 检查摄像头（仅提示）
if [ -e /dev/video0 ]; then
    echo "[OK] 检测到摄像头: /dev/video0"
else
    echo "[WARN] 未检测到摄像头 /dev/video0，视频流可能无法工作"
fi
echo ""

# 启动 Web Demo
echo "启动 Web 界面..."
echo "浏览器访问: http://localhost:7860"
echo ""
echo "按 Ctrl+C 停止服务"
echo ""

python app_demo.py
