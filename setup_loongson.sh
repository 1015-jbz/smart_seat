#!/bin/bash
# ============================================================
# 智能座舱项目 — 龙芯 LoongArch64 一键安装脚本
# 适用于：银河麒麟 V11 / LoongArch64 / 新世界生态
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=============================================="
echo "  智能座舱项目 - 龙芯平台安装向导"
echo "  LoongArch64 + 银河麒麟 V11"
echo "=============================================="
echo -e "${NC}"

# 项目根目录
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# ------------------------------------------------------------
# 第 1 步：检查基础工具
# ------------------------------------------------------------
echo -e "\n${GREEN}[1/8] 检查基础编译工具...${NC}"

check_cmd() {
    if command -v "$1" &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $1 已安装 ($($1 --version 2>&1 | head -1))"
        return 0
    else
        echo -e "  ${YELLOW}✗${NC} $1 未安装"
        return 1
    fi
}

NEED_INSTALL=0
check_cmd gcc || NEED_INSTALL=1
check_cmd g++ || NEED_INSTALL=1
check_cmd cmake || NEED_INSTALL=1
check_cmd git || NEED_INSTALL=1

if [ "$NEED_INSTALL" -eq 1 ]; then
    echo -e "\n${YELLOW}正在安装编译工具（需要 sudo 权限）...${NC}"
    sudo yum install -y gcc gcc-c++ make cmake git
    echo -e "${GREEN}编译工具安装完成${NC}"
else
    echo -e "${GREEN}所有基础工具已就绪${NC}"
fi

# ------------------------------------------------------------
# 第 2 步：检查 Python 环境
# ------------------------------------------------------------
echo -e "\n${GREEN}[2/8] 检查 Python 环境...${NC}"

if command -v uv &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} UV 已安装 ($(uv self version 2>/dev/null || echo '已安装'))"
else
    echo -e "  ${RED}✗${NC} UV 未安装，请先配置 UV 环境"
    echo "  参考：环境配置文档第四节"
    exit 1
fi

# 检查 Python 版本
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo -e "  当前系统 Python: ${PYTHON_VERSION}"

# ------------------------------------------------------------
# 第 3 步：创建虚拟环境
# ------------------------------------------------------------
echo -e "\n${GREEN}[3/8] 创建 Python 虚拟环境...${NC}"

if [ -d ".venv" ]; then
    echo -e "  ${YELLOW}虚拟环境已存在，跳过创建${NC}"
else
    # 优先用 3.11，如果没有就用系统默认
    if uv python list --only-installed 2>/dev/null | grep -q "3.11"; then
        echo "  使用 Python 3.11 创建虚拟环境"
        uv venv --python 3.11 .venv
    else
        echo "  使用默认 Python 创建虚拟环境"
        uv venv .venv
    fi
    echo -e "${GREEN}虚拟环境创建完成${NC}"
fi

# 激活虚拟环境
source .venv/bin/activate
echo -e "  虚拟环境已激活: $(python --version)"

# ------------------------------------------------------------
# 第 4 步：安装基础依赖（容易装上的）
# ------------------------------------------------------------
echo -e "\n${GREEN}[4/8] 安装基础依赖包...${NC}"
echo "  （纯 Python 包 + 龙芯源有预编译的包）"

BASE_PACKAGES=(
    "python-dotenv>=1.0.0"
    "numpy>=1.24.0"
    "scipy>=1.11.0"
    "edge-tts>=6.1.0"
    "opencv-python>=4.9.0,<5.0"
    "gradio>=6.0"
    "flask>=3.0"
    "pydantic>=2.6.0"
    "loguru>=0.7.0"
    "pyttsx3>=2.90"
)

for pkg in "${BASE_PACKAGES[@]}"; do
    echo -n "  安装 $pkg ... "
    if uv pip install "$pkg" 2>&1 | tail -1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠ 安装失败，跳过（后续单独处理）${NC}"
    fi
done

# ------------------------------------------------------------
# 第 5 步：尝试安装 onnxruntime
# ------------------------------------------------------------
echo -e "\n${GREEN}[5/8] 尝试安装 onnxruntime...${NC}"

if uv pip install "onnxruntime>=1.17.0" 2>&1 | tail -3; then
    echo -e "${GREEN}✓ onnxruntime 安装成功${NC}"
else
    echo -e "${YELLOW}⚠ onnxruntime 安装失败${NC}"
    echo "  表情识别将降级为 OpenCV 启发式模式"
    echo "  后续可手动编译 onnxruntime 或 ncnn 替代"
fi

# ------------------------------------------------------------
# 第 6 步：尝试安装 faster-whisper
# ------------------------------------------------------------
echo -e "\n${GREEN}[6/8] 尝试安装 faster-whisper...${NC}"

if uv pip install "faster-whisper>=1.0.0" 2>&1 | tail -3; then
    echo -e "${GREEN}✓ faster-whisper 安装成功${NC}"
else
    echo -e "${YELLOW}⚠ faster-whisper 安装失败${NC}"
    echo "  尝试降级到 openai-whisper..."
    if uv pip install "openai-whisper>=20231117" 2>&1 | tail -3; then
        echo -e "${GREEN}✓ openai-whisper 安装成功（性能较低）${NC}"
    else
        echo -e "${YELLOW}⚠ openai-whisper 也安装失败${NC}"
        echo "  语音识别功能暂时不可用，可以使用文字输入"
    fi
fi

# ------------------------------------------------------------
# 第 7 步：下载 ONNX 模型
# ------------------------------------------------------------
echo -e "\n${GREEN}[7/8] 下载 ONNX 表情识别模型...${NC}"

if [ -f "models/enet_b2_7.onnx" ]; then
    MODEL_SIZE=$(stat -c%s "models/enet_b2_7.onnx" 2>/dev/null || echo 0)
    if [ "$MODEL_SIZE" -gt 30000000 ]; then
        echo -e "  ${GREEN}✓ 模型已存在，跳过下载${NC}"
    else
        echo "  模型文件不完整，重新下载..."
        python scripts/setup_models.py || echo -e "${YELLOW}⚠ 下载失败，请手动下载${NC}"
    fi
else
    echo "  开始下载模型（约 30MB）..."
    python scripts/setup_models.py || echo -e "${YELLOW}⚠ 下载失败，请手动下载${NC}"
fi

# ------------------------------------------------------------
# 第 8 步：配置环境变量
# ------------------------------------------------------------
echo -e "\n${GREEN}[8/8] 配置环境变量...${NC}"

if [ -f ".env" ]; then
    echo -e "  ${GREEN}✓ .env 已存在${NC}"
else
    cp .env.example .env
    echo -e "  ${GREEN}✓ 已从 .env.example 复制 .env${NC}"
    echo ""
    echo -e "  ${YELLOW}提示：${NC}"
    echo "  如需使用 DeepSeek 大模型对话，请编辑 .env 文件"
    echo "  填入 DEEPSEEK_API_KEY=sk-你的key"
    echo "  不填也能跑，对话降级为本地模板"
fi

# ------------------------------------------------------------
# 完成
# ------------------------------------------------------------
echo -e "\n${GREEN}"
echo "=============================================="
echo "  安装完成！"
echo "=============================================="
echo -e "${NC}"
echo "  启动命令："
echo "    source .venv/bin/activate"
echo "    python app_demo.py"
echo ""
echo "  或者直接运行："
echo "    bash start_loongson.sh"
echo ""
echo -e "  ${YELLOW}注意事项：${NC}"
echo "  1. 如果 onnxruntime 没装上，表情识别用降级模式"
echo "  2. 如果 faster-whisper 没装上，语音用文字输入代替"
echo "  3. 虚拟机摄像头可能无法直通，视频流会黑屏"
echo ""
