#!/bin/bash
# ============================================================
# 智能座舱助手 - 龙芯平台（LoongArch64 / loong64）环境安装脚本
# ============================================================
# 支持: Loongnix / UOS / KylinOS V10/V11 / Debian-loong64
# 前置: 建议已装 uv (https://mirrors.loong64.com) + nodejs
# 用法: chmod +x setup.sh && ./setup.sh
# ============================================================
set -e

# ---------- 颜色 ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR ]${NC}  $1"; }
step()  { echo -e "\n${BLUE}==> $1${NC}"; }

# ---------- 架构检测 ----------
ARCH=$(uname -m)
info "检测到架构: ${ARCH}"
if [[ "$ARCH" != "loongarch64" && "$ARCH" != "loong64" ]]; then
    warn "非龙芯架构 (${ARCH})，脚本将继续，但部分平台适配可能不适用"
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
info "项目目录: ${PROJECT_DIR}"

# ---------- 龙芯 PyPI 镜像 ----------
LOONG64_PYPI="https://mirrors.loong64.com/pypi/simple"
TSINGHUA_PYPI="https://pypi.tuna.tsinghua.edu.cn/simple"

# ============================================================
# 步骤 1: 检测并修复 Node.js / npm 环境
# ============================================================
step "步骤 1/5: 检测 Node.js 与 npm..."

detect_node_npm() {
    # 1) 直接从 PATH 找
    NODE_BIN=""
    NPM_BIN=""
    if command -v node &>/dev/null; then
        NODE_BIN="$(command -v node)"
    fi
    if command -v npm &>/dev/null; then
        NPM_BIN="$(command -v npm)"
    fi

    # 2) 找常见安装位置
    for p in /usr/local/bin/node /usr/bin/node /opt/node/bin/node \
             "$HOME/.nvm/versions/node"/*/bin/node "$HOME/node/bin/node"; do
        if [ -z "$NODE_BIN" ] && [ -x "$p" ]; then
            NODE_BIN="$p"
            break
        fi
    done
    # 根据 node 路径推 npm
    if [ -z "$NPM_BIN" ] && [ -n "$NODE_BIN" ]; then
        _npm_candidate="$(dirname "$NODE_BIN")/npm"
        [ -x "$_npm_candidate" ] && NPM_BIN="$_npm_candidate"
    fi

    # 3) 尝试加载 nvm（用户交互式shell有，但脚本里没加载）
    if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
        for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
            if [ -f "$f" ]; then
                # shellcheck disable=SC1090
                source "$f" 2>/dev/null || true
                if command -v nvm &>/dev/null; then
                    nvm use default >/dev/null 2>&1 || nvm use system >/dev/null 2>&1 || true
                fi
                command -v node &>/dev/null && NODE_BIN="$(command -v node)"
                command -v npm &>/dev/null && NPM_BIN="$(command -v npm)"
                [ -n "$NODE_BIN" ] && [ -n "$NPM_BIN" ] && break
            fi
        done
    fi

    echo "$NODE_BIN|$NPM_BIN"
}

DETECTED=$(detect_node_npm)
NODE_BIN="$(echo "$DETECTED" | cut -d'|' -f1)"
NPM_BIN="$(echo "$DETECTED" | cut -d'|' -f2)"

if [ -n "$NODE_BIN" ]; then
    NODE_VER=$("$NODE_BIN" -v 2>/dev/null || echo "?")
    info "检测到 Node.js: $NODE_BIN ($NODE_VER)"
else
    warn "未在 PATH 中找到 node!"
fi

if [ -n "$NPM_BIN" ]; then
    NPM_VER=$("$NPM_BIN" -v 2>/dev/null || echo "?")
    info "检测到 npm:    $NPM_BIN ($NPM_VER)"
else
    err "未在 PATH 中找到 npm!"
    echo ""
    echo "请按以下任一方式修复后重新运行:"
    echo "  方式 1) 用 apt 安装 (Kylin/UOS):"
    echo "     sudo apt update && sudo apt install -y nodejs npm"
    echo ""
    echo "  方式 2) 如果 node 已装在 /opt/node 或 ~/node，把 bin 加到 PATH:"
    echo "     export PATH=\$PATH:/opt/node/bin:~/node/bin"
    echo "     echo 'export PATH=\$PATH:/opt/node/bin:~/node/bin' >> ~/.bashrc"
    echo ""
    echo "  方式 3) 查找系统里的 node 二进制:"
    echo "     sudo find / -name 'node' -type f 2>/dev/null | head -5"
    echo "     # 找到后把所在目录 export PATH=\$PATH:目录"
    echo ""
    read -rp "按回车退出，请先修复 npm 环境..." _
    exit 1
fi

# 确保后续调用的 npm/node 就是检测到的
export PATH="$(dirname "$NPM_BIN"):$PATH"

# ============================================================
# 步骤 2: 创建 Python 虚拟环境（优先用 uv，回退 venv）
# ============================================================
step "步骤 2/5: 创建 Python 虚拟环境..."
cd "$BACKEND_DIR"

VENV_DIR="$BACKEND_DIR/.venv"
UV_EXTRA=""

if command -v uv &>/dev/null; then
    info "检测到 uv 工具，使用 uv 创建虚拟环境并配置 loong64 镜像..."
    export UV_EXTRA_INDEX_URL="$LOONG64_PYPI"
    UV_EXTRA="--extra-index-url $LOONG64_PYPI"
    info "  UV_EXTRA_INDEX_URL = $UV_EXTRA_INDEX_URL"

    if [ ! -d "$VENV_DIR" ]; then
        uv venv "$VENV_DIR" --python python3
        info ".venv (uv) 创建完成"
    else
        info ".venv 已存在，跳过创建"
    fi
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"

    uv pip install --upgrade pip -q
else
    warn "未检测到 uv，回退到 python3 -m venv。建议安装 uv 以启用 loong64 镜像源:"
    warn "  curl -LsSf https://mirrors.loong64.com/uv/install.sh | sh"
    if [ ! -d "$VENV_DIR" ]; then
        python3 -m venv "$VENV_DIR"
        info ".venv 创建完成"
    else
        info ".venv 已存在，跳过创建"
    fi
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip -q -i "$TSINGHUA_PYPI"
fi

PY_VER=$(python --version 2>&1)
info "当前 Python: $PY_VER"

# ============================================================
# 步骤 3: 安装 Python 依赖（onnxruntime / opencv 优先 loong64 镜像）
# ============================================================
step "步骤 3/5: 安装 Python 依赖..."

install_core() {
    info "  → 核心依赖 (FastAPI / Uvicorn / SQLAlchemy / httpx / Flask)..."
    if command -v uv &>/dev/null; then
        uv pip install \
            "fastapi>=0.110.0" "uvicorn[standard]>=0.27.0" "sqlalchemy>=2.0.0" \
            "pydantic>=2.0.0" "httpx>=0.27.0" "python-dotenv>=1.0.0" \
            "Pillow>=10.0.0" "flask>=3.0.0" -q
    else
        pip install \
            "fastapi>=0.110.0" "uvicorn[standard]>=0.27.0" "sqlalchemy>=2.0.0" \
            "pydantic>=2.0.0" "httpx>=0.27.0" "python-dotenv>=1.0.0" \
            "numpy>=1.24.0" "Pillow>=10.0.0" "flask>=3.0.0" \
            -q -i "$TSINGHUA_PYPI"
    fi
}
install_core

# numpy / opencv-python: 龙芯有 loong64 whl
info "  → numpy + opencv-python (优先 loong64 镜像)..."
if command -v uv &>/dev/null; then
    uv pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q $UV_EXTRA || \
        uv pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q
else
    pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q \
        --extra-index-url "$LOONG64_PYPI" -i "$TSINGHUA_PYPI" || \
    pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q -i "$TSINGHUA_PYPI"
fi

# onnxruntime: 龙芯 loong64 镜像里有
info "  → onnxruntime (可选，表情识别 ONNX 推理引擎)..."
ONNX_OK=0
if command -v uv &>/dev/null; then
    uv pip install "onnxruntime>=1.15.0" -q $UV_EXTRA && ONNX_OK=1 || ONNX_OK=0
else
    pip install "onnxruntime>=1.15.0" -q \
        --extra-index-url "$LOONG64_PYPI" -i "$TSINGHUA_PYPI" && ONNX_OK=1 || ONNX_OK=0
fi
if [ $ONNX_OK -eq 1 ]; then
    info "    onnxruntime 安装成功 ✓"
else
    warn "    onnxruntime 不可用，表情识别将自动降级为规则引擎 (LBP)"
fi

# mediapipe: 龙芯官方无 whl，跳过；代码里会回退到 OpenCV Haar
info "  → mediapipe (可选，人脸关键点)..."
MP_OK=0
if command -v uv &>/dev/null; then
    uv pip install "mediapipe>=0.10.0" -q 2>/dev/null && MP_OK=1 || MP_OK=0
else
    pip install "mediapipe>=0.10.0" -q -i "$TSINGHUA_PYPI" 2>/dev/null && MP_OK=1 || MP_OK=0
fi
if [ $MP_OK -eq 1 ]; then
    info "    mediapipe 安装成功 ✓"
else
    warn "    mediapipe 不可用，人脸检测将降级为 OpenCV Haar Cascade"
fi

# 创建 data 目录
mkdir -p "$BACKEND_DIR/data"
deactivate

# ============================================================
# 步骤 4: 前端依赖安装
# ============================================================
step "步骤 4/5: 安装前端依赖..."
cd "$PROJECT_DIR"

export npm_config_registry="https://registry.npmmirror.com"
info "  使用镜像: $npm_config_registry"

if [ -d "node_modules" ]; then
    info "  node_modules 已存在，跳过（如需重装请先 rm -rf node_modules）"
else
    if "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com; then
        info "  前端依赖安装完成 ✓"
    else
        warn "  npm install 失败，尝试清理缓存后重试一次..."
        "$NPM_BIN" cache clean --force 2>/dev/null || true
        rm -rf node_modules package-lock.json 2>/dev/null || true
        if "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com; then
            info "  前端依赖安装完成 ✓"
        else
            err "  前端依赖仍失败，请手动执行:"
            err "    cd $PROJECT_DIR && npm install --registry=https://registry.npmmirror.com"
            # 不 exit，继续往下走，让用户手动修
        fi
    fi
fi

# ============================================================
# 步骤 5: 环境变量模板
# ============================================================
step "步骤 5/5: 配置检查..."
if [ ! -f "$BACKEND_DIR/.env" ]; then
    warn "backend/.env 不存在，已生成模板（聊天功能需填 DEEPSEEK_API_KEY）"
    cat > "$BACKEND_DIR/.env" <<'EOF'
# 智能座舱助手后端环境变量
# 聊天 API（可选，留空则聊天页面回退到本地 mock）
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 摄像头服务（可选，默认 7861）
CAMERA_PORT=7861
EOF
else
    info "backend/.env 已存在 ✓"
fi

# ============================================================
# 安装完成 - 状态报告
# ============================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  安装完成！下一步: ./start.sh${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Python 组件状态:"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -c "import fastapi;   print('  FastAPI      ✓', fastapi.__version__)" 2>/dev/null || echo "  FastAPI      ✗"
python -c "import uvicorn;   print('  Uvicorn      ✓', uvicorn.__version__)" 2>/dev/null || echo "  Uvicorn      ✗"
python -c "import sqlalchemy;print('  SQLAlchemy   ✓', sqlalchemy.__version__)" 2>/dev/null || echo "  SQLAlchemy   ✗"
python -c "import numpy;     print('  NumPy        ✓', numpy.__version__)" 2>/dev/null || echo "  NumPy        ✗"
python -c "import cv2;       print('  OpenCV       ✓', cv2.__version__)" 2>/dev/null || echo "  OpenCV       ✗"
python -c "import onnxruntime;print('  ONNX Runtime ✓', onnxruntime.__version__)" 2>/dev/null || echo "  ONNX Runtime ✗ (降级为 LBP 规则引擎)"
python -c "import mediapipe; print('  MediaPipe    ✓', mediapipe.__version__)" 2>/dev/null || echo "  MediaPipe    ✗ (降级为 Haar 级联)"
python -c "import flask;     print('  Flask        ✓', flask.__version__)" 2>/dev/null || echo "  Flask        ✗"
deactivate
echo ""
echo "前端/工具链:"
"$NODE_BIN" -v 2>/dev/null | awk '{print "  Node.js      ✓ "$1}' || echo "  Node.js      ✗"
"$NPM_BIN"  -v 2>/dev/null | awk '{print "  npm          ✓ "$1}' || echo "  npm          ✗"
command -v uv &>/dev/null && echo "  uv           ✓ $(uv --version 2>/dev/null | head -1)" || echo "  uv           ✗ (建议安装: curl -LsSf https://mirrors.loong64.com/uv/install.sh | sh)"
echo ""
echo "启动:"
echo "  chmod +x start.sh && ./start.sh"
echo "  手动启动: cd backend && source .venv/bin/activate && PYTHONPATH=. uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo "  前端另开终端: npm run dev"
echo ""
