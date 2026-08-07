#!/bin/bash
# ============================================================
# 智能座舱助手 - 龙芯平台（LoongArch / loong64）环境安装脚本
# ============================================================
# 支持: Loongnix / UOS / KylinOS / Debian-loong64
# 用法: chmod +x setup.sh && ./setup.sh
# ============================================================
set -e

# ---------- 颜色 ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR]${NC}   $1"; }

# ---------- 架构检测 ----------
ARCH=$(uname -m)
info "检测到架构: ${ARCH}"
if [[ "$ARCH" != "loongarch64" && "$ARCH" != "loong64" ]]; then
    warn "非龙芯架构 (${ARCH})，脚本将继续，但部分平台适配可能不适用"
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
info "项目目录: ${PROJECT_DIR}"

# ---------- 1. 系统依赖 ----------
info "步骤 1/5: 安装系统依赖..."

install_sys_deps() {
    if command -v apt &>/dev/null; then
        sudo apt update -qq
        sudo apt install -y -qq python3 python3-pip python3-venv python3-opencv nodejs npm curl 2>/dev/null || true
    elif command -v yum &>/dev/null; then
        sudo yum install -y python3 python3-pip python3-opencv nodejs npm curl 2>/dev/null || true
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y python3 python3-pip python3-opencv nodejs npm curl 2>/dev/null || true
    elif command -v pacman &>/dev/null; then
        sudo pacman -S --noconfirm python python-pip opencv nodejs npm curl 2>/dev/null || true
    else
        warn "未识别包管理器，跳过系统依赖安装，请手动安装 python3 / pip / nodejs / npm"
    fi
}
install_sys_deps

# ---------- 2. Python 虚拟环境 ----------
info "步骤 2/5: 创建 Python 虚拟环境..."
cd "${PROJECT_DIR}/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    info "venv 创建完成"
else
    info "venv 已存在，跳过"
fi
source venv/bin/activate
pip install --upgrade pip -q

# ---------- 3. Python 依赖 ----------
info "步骤 3/5: 安装 Python 依赖..."

# 核心依赖（纯 Python，所有平台通用）
info "  → 核心依赖 (FastAPI / SQLAlchemy / httpx)..."
pip install fastapi>=0.110.0 "uvicorn[standard]>=0.27.0" sqlalchemy>=2.0.0 \
    pydantic>=2.0.0 httpx>=0.27.0 python-dotenv>=1.0.0 numpy>=1.24.0 \
    Pillow>=10.0.0 flask>=3.0.0 -q

# opencv-python: 优先用系统包 (python3-opencv)，pip 备用
info "  → OpenCV..."
if python3 -c "import cv2" 2>/dev/null; then
    info "    使用系统 opencv"
else
    pip install opencv-python>=4.8.0 -q 2>/dev/null || \
        warn "    opencv-python 安装失败，请手动执行: sudo apt install python3-opencv"
fi

# onnxruntime: 龙芯无官方 whl，尝试安装，失败则跳过（代码会自动降级）
info "  → ONNX Runtime (可选，失败不影响运行)..."
pip install onnxruntime>=1.15.0 -q 2>/dev/null && \
    info "    ONNX Runtime 安装成功" || \
    warn "    ONNX Runtime 不可用（龙芯无预编译包），表情识别将使用 MediaPipe 规则引擎"

# mediapipe: 龙芯无官方 whl，源码编译极难，标记为可选
info "  → MediaPipe (可选，失败不影响运行)..."
pip install mediapipe>=0.10.0 -q 2>/dev/null && \
    info "    MediaPipe 安装成功" || \
    warn "    MediaPipe 不可用（龙芯无预编译包），将降级到 OpenCV Haar Cascade 人脸检测"

deactivate

# ---------- 4. 前端依赖 ----------
info "步骤 4/5: 安装前端依赖..."
cd "${PROJECT_DIR}"
npm install --no-audit --no-fund 2>/dev/null || {
    warn "npm install 失败，尝试 cnpm..."
    npm install -g cnpm --registry=https://registry.npmmirror.com 2>/dev/null || true
    cnpm install 2>/dev/null || warn "前端依赖安装失败，请手动执行 npm install"
}
info "    前端依赖安装完成"

# ---------- 5. 环境变量 ----------
info "步骤 5/5: 检查环境变量..."
if [ ! -f "${PROJECT_DIR}/backend/.env" ]; then
    warn "backend/.env 不存在，请手动创建并配置 DEEPSEEK_API_KEY"
    echo 'DEEPSEEK_API_KEY=your_api_key_here' > "${PROJECT_DIR}/backend/.env"
    info "已生成模板 backend/.env，请编辑填入 API Key"
else
    info "backend/.env 已存在"
fi

# ---------- 完成 ----------
echo ""
info "========================================"
info "  安装完成！"
info "  运行 ./start.sh 启动所有服务"
info "  或手动: cd backend && source venv/bin/activate"
info "========================================"

# 显示可用组件状态
echo ""
echo "组件检测:"
python3 -c "import cv2; print('  OpenCV       ✓', cv2.__version__)" 2>/dev/null || echo "  OpenCV       ✗"
python3 -c "import onnxruntime; print('  ONNX Runtime ✓', onnxruntime.__version__)" 2>/dev/null || echo "  ONNX Runtime ✗ (降级运行)"
python3 -c "import mediapipe; print('  MediaPipe    ✓', mediapipe.__version__)" 2>/dev/null || echo "  MediaPipe    ✗ (Haar 级联降级)"
echo "  Node.js      $(node -v 2>/dev/null || echo '✗')"
echo "  npm          $(npm -v 2>/dev/null || echo '✗')"
