#!/bin/bash
# ============================================================
# 智能座舱助手 - 一键安装脚本
# ============================================================
# 支持: UOS / KylinOS / Loongnix / Debian / Ubuntu
# 用法: chmod +x setup.sh && ./setup.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
step()  { echo -e "\n${BLUE}==> $1${NC}"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
LOONG64_PYPI="https://mirrors.loong64.com/pypi/simple"
TSINGHUA_PYPI="https://pypi.tuna.tsinghua.edu.cn/simple"

# ============================================================
# 步骤 1: Python 3.10+
# ============================================================
step "1/4  检查 Python..."

PYTHON_CMD=""
# 按优先级找 Python 3.10+
for cmd in python3.11 python3.10 python3; do
    if command -v "$cmd" &>/dev/null; then
        if "$cmd" -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    warn "未找到 Python >= 3.10，尝试安装..."
    if command -v apt &>/dev/null; then
        sudo apt update -qq
        sudo apt install -y python3.11 python3.11-venv python3.11-dev 2>/dev/null \
            || sudo apt install -y python3.10 python3.10-venv python3.10-dev 2>/dev/null \
            || { err "apt 安装 Python 失败，请手动安装 python3.11"; exit 1; }
        # 找到刚装的版本
        for cmd in python3.11 python3.10; do
            if command -v "$cmd" &>/dev/null; then
                PYTHON_CMD="$cmd"
                break
            fi
        done
    else
        err "请先安装 Python 3.10+"
        exit 1
    fi
fi

info "Python: $($PYTHON_CMD --version)"

# ============================================================
# 步骤 2: Node.js + npm
# ============================================================
step "2/4  检查 Node.js..."

NODE_BIN=""
NPM_BIN=""

if command -v node &>/dev/null; then NODE_BIN="$(command -v node)"; fi
if command -v npm &>/dev/null; then NPM_BIN="$(command -v npm)"; fi

# 兜底常见路径
for p in /usr/local/bin/node /usr/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
    [ -z "$NODE_BIN" ] && [ -x "$p" ] && NODE_BIN="$p"
done
[ -z "$NPM_BIN" ] && [ -n "$NODE_BIN" ] && [ -x "$(dirname "$NODE_BIN")/npm" ] && NPM_BIN="$(dirname "$NODE_BIN")/npm"

# 尝试加载 nvm
if [ -z "$NODE_BIN" ]; then
    for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
        [ -f "$f" ] && source "$f" 2>/dev/null || true
        command -v node &>/dev/null && NODE_BIN="$(command -v node)"
        command -v npm  &>/dev/null && NPM_BIN="$(command -v npm)"
        [ -n "$NODE_BIN" ] && break
    done
fi

if [ -z "$NODE_BIN" ]; then
    warn "未找到 Node.js，尝试安装..."
    if command -v apt &>/dev/null; then
        sudo apt install -y nodejs npm 2>/dev/null && {
            NODE_BIN="$(command -v node)"
            NPM_BIN="$(command -v npm)"
        } || warn "apt 安装失败，请手动安装 Node.js 18+"
    fi
fi

if [ -n "$NODE_BIN" ]; then
    info "Node.js: $($NODE_BIN -v 2>/dev/null)  npm: $($NPM_BIN -v 2>/dev/null)"
    export PATH="$(dirname "$NODE_BIN"):$PATH"
else
    err "未找到 Node.js！请安装: sudo apt install -y nodejs npm"
    exit 1
fi

# ============================================================
# 步骤 3: Python 虚拟环境 + 依赖
# ============================================================
step "3/4  安装 Python 依赖..."

VENV_DIR="${BACKEND_DIR}/.venv"
cd "$BACKEND_DIR"

if [ ! -d "$VENV_DIR" ]; then
    $PYTHON_CMD -m venv "$VENV_DIR"
    info "虚拟环境创建完成"
else
    info "虚拟环境已存在"
fi

source "${VENV_DIR}/bin/activate"
pip install --upgrade pip -q -i "$TSINGHUA_PYPI" 2>/dev/null

# 安装依赖
pip install \
    "fastapi>=0.110.0" "uvicorn[standard]>=0.27.0" "sqlalchemy>=2.0.0" \
    "pydantic>=2.0.0" "httpx>=0.27.0" "python-dotenv>=1.0.0" \
    "numpy>=1.24.0" "Pillow>=10.0.0" \
    "flask>=3.0.0" "edge-tts>=6.1.0" \
    -i "$TSINGHUA_PYPI" -q

# opencv + onnxruntime（龙芯优先用 loong64 镜像）
pip install "opencv-python>=4.8.0" -q \
    --extra-index-url "$LOONG64_PYPI" -i "$TSINGHUA_PYPI" 2>/dev/null \
    || pip install "opencv-python>=4.8.0" -q -i "$TSINGHUA_PYPI" 2>/dev/null \
    || warn "opencv 安装失败"

pip install "onnxruntime>=1.15.0" -q \
    --extra-index-url "$LOONG64_PYPI" -i "$TSINGHUA_PYPI" 2>/dev/null \
    || pip install "onnxruntime>=1.15.0" -q -i "$TSINGHUA_PYPI" 2>/dev/null \
    || warn "onnxruntime 不可用，表情识别降级"

# mediapipe（可选）
pip install "mediapipe>=0.10.0" -q -i "$TSINGHUA_PYPI" 2>/dev/null \
    || warn "mediapipe 不可用，人脸检测降级为 Haar"

info "Python 依赖安装完成"
deactivate

# ============================================================
# 步骤 4: 前端依赖 + 构建
# ============================================================
step "4/4  安装前端依赖..."

cd "$PROJECT_DIR"
export npm_config_registry="https://registry.npmmirror.com"

if [ -d "node_modules" ]; then
    info "node_modules 已存在，跳过"
else
    npm install --no-audit --no-fund --registry=https://registry.npmmirror.com \
        && info "前端依赖安装完成" \
        || { err "npm install 失败"; exit 1; }
fi

# 构建 dist
if [ ! -f "dist/index.html" ]; then
    npm run build && info "dist 构建完成" || warn "dist 构建失败"
else
    info "dist 已存在，跳过构建"
fi

# ============================================================
# 环境变量
# ============================================================
if [ ! -f "$BACKEND_DIR/.env" ]; then
    cat > "$BACKEND_DIR/.env" <<'EOF'
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
CAMERA_PORT=7861
TTS_PORT=7862
AMAP_KEY=8daa61d5b1071072de54569a88268aad
EOF
    info "已生成 backend/.env"
else
    if ! grep -q "AMAP_KEY" "$BACKEND_DIR/.env" 2>/dev/null; then
        echo "AMAP_KEY=8daa61d5b1071072de54569a88268aad" >> "$BACKEND_DIR/.env"
    fi
fi

# ============================================================
# 完成
# ============================================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  安装完成！执行 ./start.sh 启动${NC}"
echo -e "${GREEN}========================================${NC}"
