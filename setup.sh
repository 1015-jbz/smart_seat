#!/bin/bash
# ============================================================
# 智能座舱助手 - 龙芯平台（LoongArch64 / loong64）环境安装脚本
# ============================================================
# 支持: Loongnix / UOS / KylinOS V10/V11 / Debian-loong64
# 前置: 无（脚本会自动检测并安装所需环境）
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
# 步骤 0: 安装 Python 3.10+（如果系统 Python 太旧）
# ============================================================
step "步骤 0/6: 检查 Python 版本..."

MIN_PYTHON_VER="3.10"
NEED_PYTHON_INSTALL=0

# 检查 python3 版本
if command -v python3 &>/dev/null; then
    CURRENT_PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    info "当前 Python 版本: ${CURRENT_PY_VER}"
    # 比较版本
    if python3 -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
        info "Python >= 3.10，满足要求 ✓"
    else
        warn "Python ${CURRENT_PY_VER} < 3.10，需要安装新版"
        NEED_PYTHON_INSTALL=1
    fi
else
    warn "未找到 python3"
    NEED_PYTHON_INSTALL=1
fi

if [ $NEED_PYTHON_INSTALL -eq 1 ]; then
    info "尝试通过 apt 安装 Python 3.11..."
    if sudo apt update -qq && sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip 2>/dev/null; then
        info "Python 3.11 安装成功 ✓"
        # 确保 python3 指向 3.11
        if command -v python3.11 &>/dev/null; then
            sudo update-alternatives --install /usr/bin/python3 python3 "$(command -v python3.11)" 2 2>/dev/null || true
            sudo update-alternatives --set python3 "$(command -v python3.11)" 2>/dev/null || true
        fi
    else
        warn "apt 安装失败，尝试 pyenv 方式..."
        # 安装 pyenv 依赖
        sudo apt install -y make build-essential libssl-dev zlib1g-dev \
            libbz2-dev libreadline-dev libsqlite3-dev wget curl llvm \
            libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev \
            libffi-dev liblzma-dev 2>/dev/null || true

        # 安装 pyenv
        if [ ! -d "$HOME/.pyenv" ]; then
            curl https://pyenv.run | bash
        fi

        export PYENV_ROOT="$HOME/.pyenv"
        export PATH="$PYENV_ROOT/bin:$PATH"
        eval "$(pyenv init --path)"
        eval "$(pyenv init -)"

        pyenv install 3.11.9
        pyenv global 3.11.9
        info "pyenv Python 3.11.9 安装完成 ✓"
    fi
fi

# 最终验证
PYTHON_CMD="python3"
if command -v python3.11 &>/dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
fi
PY_VER=$($PYTHON_CMD --version 2>&1)
info "使用 Python: ${PY_VER}"

# ============================================================
# 步骤 1: 检测并修复 Node.js / npm 环境
# ============================================================
step "步骤 1/6: 检测 Node.js 与 npm..."

detect_node_npm() {
    NODE_BIN=""
    NPM_BIN=""
    if command -v node &>/dev/null; then
        NODE_BIN="$(command -v node)"
    fi
    if command -v npm &>/dev/null; then
        NPM_BIN="$(command -v npm)"
    fi

    for p in /usr/local/bin/node /usr/bin/node /opt/node/bin/node \
             "$HOME/.nvm/versions/node"/*/bin/node "$HOME/node/bin/node"; do
        if [ -z "$NODE_BIN" ] && [ -x "$p" ]; then
            NODE_BIN="$p"
            break
        fi
    done
    if [ -z "$NPM_BIN" ] && [ -n "$NODE_BIN" ]; then
        _npm_candidate="$(dirname "$NODE_BIN")/npm"
        [ -x "$_npm_candidate" ] && NPM_BIN="$_npm_candidate"
    fi

    if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
        for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
            if [ -f "$f" ]; then
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
    warn "未找到 Node.js，尝试安装..."
    if command -v apt &>/dev/null; then
        sudo apt install -y nodejs npm 2>/dev/null && {
            NODE_BIN="$(command -v node)"
            NPM_BIN="$(command -v npm)"
            info "Node.js 安装成功: $($NODE_BIN -v 2>/dev/null)"
        } || warn "apt 安装失败，请手动安装 Node.js"
    fi
fi

if [ -n "$NPM_BIN" ]; then
    NPM_VER=$("$NPM_BIN" -v 2>/dev/null || echo "?")
    info "检测到 npm:    $NPM_BIN ($NPM_VER)"
else
    err "未找到 npm！前端构建需要 Node.js/npm"
    echo ""
    echo "请按以下任一方式修复:"
    echo "  方式 1) sudo apt install -y nodejs npm"
    echo "  方式 2) 用 nvm 安装: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "         nvm install 18"
    echo ""
    read -rp "按回车退出..." _
    exit 1
fi

export PATH="$(dirname "$NPM_BIN"):$PATH"

# ============================================================
# 步骤 2: 创建 Python 虚拟环境
# ============================================================
step "步骤 2/6: 创建 Python 虚拟环境..."
cd "$BACKEND_DIR"

VENV_DIR="$BACKEND_DIR/.venv"
UV_EXTRA=""

if command -v uv &>/dev/null; then
    info "检测到 uv，使用 uv 创建虚拟环境..."
    export UV_EXTRA_INDEX_URL="$LOONG64_PYPI"
    UV_EXTRA="--extra-index-url $LOONG64_PYPI"

    if [ ! -d "$VENV_DIR" ]; then
        uv venv "$VENV_DIR" --python "${PYTHON_CMD}"
        info ".venv (uv) 创建完成"
    else
        info ".venv 已存在，跳过创建"
    fi
    source "$VENV_DIR/bin/activate"
    uv pip install --upgrade pip -q
else
    warn "未检测到 uv，使用 python3 -m venv"
    if [ ! -d "$VENV_DIR" ]; then
        $PYTHON_CMD -m venv "$VENV_DIR"
        info ".venv 创建完成"
    else
        info ".venv 已存在，跳过创建"
    fi
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip -q -i "$TSINGHUA_PYPI"
fi

PY_VER=$(python --version 2>&1)
info "当前 Python: $PY_VER"

# ============================================================
# 步骤 3: 安装 Python 依赖
# ============================================================
step "步骤 3/6: 安装 Python 依赖..."

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

# numpy / opencv-python
info "  → numpy + opencv-python..."
if command -v uv &>/dev/null; then
    uv pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q $UV_EXTRA || \
        uv pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q
else
    pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q \
        --extra-index-url "$LOONG64_PYPI" -i "$TSINGHUA_PYPI" || \
    pip install "numpy>=1.24.0" "opencv-python>=4.8.0" -q -i "$TSINGHUA_PYPI"
fi

# onnxruntime
info "  → onnxruntime (表情识别 ONNX 推理引擎)..."
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

# mediapipe
info "  → mediapipe (人脸关键点)..."
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

# ============================================================
# 步骤 3.5: 安装 Whisper (语音识别 STT)
# ============================================================
info "  → Whisper (语音识别 STT)..."
WHISPER_OK=0

# 优先安装 faster-whisper（更轻量，不需要完整 PyTorch）
if command -v uv &>/dev/null; then
    uv pip install "faster-whisper>=1.0.0" -q $UV_EXTRA && WHISPER_OK=1 || WHISPER_OK=0
else
    pip install "faster-whisper>=1.0.0" -q -i "$TSINGHUA_PYPI" 2>/dev/null && WHISPER_OK=1 || WHISPER_OK=0
fi

if [ $WHISPER_OK -eq 1 ]; then
    info "    faster-whisper 安装成功 ✓"
else
    warn "    faster-whisper 不可用，尝试安装 openai-whisper..."
    if command -v uv &>/dev/null; then
        uv pip install "openai-whisper>=20231117" -q $UV_EXTRA && WHISPER_OK=2 || WHISPER_OK=0
    else
        pip install "openai-whisper>=20231117" -q -i "$TSINGHUA_PYPI" 2>/dev/null && WHISPER_OK=2 || WHISPER_OK=0
    fi
    if [ $WHISPER_OK -eq 2 ]; then
        info "    openai-whisper 安装成功 ✓"
    else
        warn "    Whisper 不可用，语音识别功能将禁用"
    fi
fi

# 创建 data 目录
mkdir -p "$BACKEND_DIR/data"

# ============================================================
# 步骤 4: 前端依赖安装
# ============================================================
step "步骤 4/6: 安装前端依赖..."
cd "$PROJECT_DIR"

export npm_config_registry="https://registry.npmmirror.com"
info "  使用镜像: $npm_config_registry"

if [ -d "node_modules" ]; then
    info "  node_modules 已存在，跳过"
else
    if "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com; then
        info "  前端依赖安装完成 ✓"
    else
        warn "  npm install 失败，清理缓存后重试..."
        "$NPM_BIN" cache clean --force 2>/dev/null || true
        rm -rf node_modules package-lock.json 2>/dev/null || true
        "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com || {
            err "  前端依赖安装失败"
        }
    fi
fi

# 构建 dist
step "步骤 5/6: 构建前端 dist..."
if [ -d "node_modules" ]; then
    "$NPM_BIN" run build && info "  dist 构建完成 ✓" || warn "  dist 构建失败，请手动执行 npm run build"
else
    warn "  跳过 dist 构建 (缺少 node_modules)"
fi

# ============================================================
# 步骤 6: 配置环境变量
# ============================================================
step "步骤 6/6: 配置环境变量..."
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cat > "$BACKEND_DIR/.env" <<'EOF'
# 智能座舱助手后端环境变量

# 聊天 API（可选）
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 摄像头服务（默认 7861）
CAMERA_PORT=7861

# TTS 语音合成服务（默认 7862）
TTS_PORT=7862

# Whisper 语音识别服务（默认 8767）
WHISPER_PORT=8767

# 高德地图 API Key（天气/定位需要）
AMAP_KEY=8daa61d5b1071072de54569a88268aad
EOF
    info "backend/.env 已生成（含 AMAP_KEY）"
else
    # 检查是否缺少 AMAP_KEY
    if ! grep -q "AMAP_KEY" "$BACKEND_DIR/.env"; then
        echo "" >> "$BACKEND_DIR/.env"
        echo "# 高德地图 API Key（天气/定位需要）" >> "$BACKEND_DIR/.env"
        echo "AMAP_KEY=8daa61d5b1071072de54569a88268aad" >> "$BACKEND_DIR/.env"
        info "已补充 AMAP_KEY 到 .env"
    else
        info "backend/.env 已存在 ✓"
    fi
fi

# ============================================================
# 安装完成
# ============================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  安装完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Python 组件状态:"
source "$VENV_DIR/bin/activate"
python -c "import fastapi;    print('  FastAPI      ✓', fastapi.__version__)" 2>/dev/null || echo "  FastAPI      ✗"
python -c "import uvicorn;    print('  Uvicorn      ✓', uvicorn.__version__)" 2>/dev/null || echo "  Uvicorn      ✗"
python -c "import sqlalchemy; print('  SQLAlchemy   ✓', sqlalchemy.__version__)" 2>/dev/null || echo "  SQLAlchemy   ✗"
python -c "import numpy;      print('  NumPy        ✓', numpy.__version__)" 2>/dev/null || echo "  NumPy        ✗"
python -c "import cv2;        print('  OpenCV       ✓', cv2.__version__)" 2>/dev/null || echo "  OpenCV       ✗"
python -c "import onnxruntime; print('  ONNX Runtime ✓', onnxruntime.__version__)" 2>/dev/null || echo "  ONNX Runtime ✗ (降级为 LBP 规则引擎)"
python -c "import mediapipe;  print('  MediaPipe    ✓', mediapipe.__version__)" 2>/dev/null || echo "  MediaPipe    ✗ (降级为 Haar 级联)"
python -c "import flask;      print('  Flask        ✓', flask.__version__)" 2>/dev/null || echo "  Flask        ✗"
python -c "import edge_tts;   print('  Edge TTS     ✓')" 2>/dev/null || echo "  Edge TTS     ✗"
python -c "import whisper;    print('  Whisper      ✓')" 2>/dev/null || echo "  Whisper      ✗ (STT 不可用)"
python -c "from faster_whisper import WhisperModel; print('  faster-whisper ✓')" 2>/dev/null || true
deactivate
echo ""
echo "前端/工具链:"
"$NODE_BIN" -v 2>/dev/null | awk '{print "  Node.js      ✓ "$1}' || echo "  Node.js      ✗"
"$NPM_BIN"  -v 2>/dev/null | awk '{print "  npm          ✓ "$1}' || echo "  npm          ✗"
echo ""
echo "启动:"
echo "  chmod +x start.sh && ./start.sh"
echo ""
