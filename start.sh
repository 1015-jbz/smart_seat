#!/bin/bash
# ============================================================
# 智能座舱助手 - 一键启动脚本（龙芯平台适配）
# ============================================================
# 用法: chmod +x start.sh && ./start.sh
# 停止: 按 Ctrl+C 自动清理所有子进程
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
LOG_DIR="${PROJECT_DIR}/logs"
PID_DIR="${PROJECT_DIR}/.pids"

# 端口配置
BACKEND_PORT=8000
CAMERA_PORT=7861
TTS_PORT=7862
WHISPER_PORT=8767
FRONTEND_PORT=5173

# ---------- 颜色 ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR ]${NC}  $1"; }
log()   { echo -e "${BLUE}[$1]${NC} $2"; }

# ---------- 初始化 ----------
mkdir -p "${LOG_DIR}" "${PID_DIR}"

# ---------- 清理函数 ----------
cleanup() {
    echo ""
    info "正在停止所有服务..."
    for pidfile in "${PID_DIR}"/*.pid; do
        if [ -f "$pidfile" ]; then
            local pid
            pid=$(cat "$pidfile")
            local name
            name=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null && log "$name" "已停止 (PID: $pid)" || true
            fi
            rm -f "$pidfile"
        fi
    done
    # 兜底：按端口杀残留
    for port in ${BACKEND_PORT} ${CAMERA_PORT} ${TTS_PORT} ${WHISPER_PORT} ${FRONTEND_PORT}; do
        local pids
        pids=$(lsof -ti:${port} 2>/dev/null || ss -lptn "sport = :${port}" 2>/dev/null | awk 'NR>1 {print $6}' | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        if [ -n "$pids" ]; then
            # shellcheck disable=SC2086
            kill $pids 2>/dev/null || true
        fi
    done
    info "所有服务已停止"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ---------- 端口检查 ----------
check_port() {
    local port=$1
    local name=$2
    if command -v lsof &>/dev/null; then
        lsof -Pi :${port} -sTCP:LISTEN -t >/dev/null 2>&1
    else
        ss -lntn "sport = :${port}" 2>/dev/null | grep -q ":${port} "
    fi
    if [ $? -eq 0 ]; then
        warn "端口 ${port} 已被占用，${name} 可能已在运行"
        return 1
    fi
    return 0
}

# ---------- 等待服务就绪 ----------
wait_for_service() {
    local url=$1
    local name=$2
    local max_wait=${3:-30}
    local count=0
    while [ $count -lt $max_wait ]; do
        if curl -sf "${url}" >/dev/null 2>&1; then
            info "${name} 就绪 → ${url}"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    warn "${name} 启动超时 (${max_wait}s)，请查看 logs/"
    return 1
}

# ---------- 找 Node/npm ----------
detect_node_npm() {
    NODE_BIN=""
    NPM_BIN=""
    NPX_BIN=""
    if command -v node &>/dev/null; then NODE_BIN="$(command -v node)"; fi
    if command -v npm  &>/dev/null; then NPM_BIN="$(command -v npm)"; fi
    if command -v npx  &>/dev/null; then NPX_BIN="$(command -v npx)"; fi
    for p in /usr/local/bin/node /usr/bin/node /opt/node/bin/node \
             "$HOME/.nvm/versions/node"/*/bin/node "$HOME/node/bin/node"; do
        if [ -z "$NODE_BIN" ] && [ -x "$p" ]; then
            NODE_BIN="$p"; break
        fi
    done
    if [ -z "$NPM_BIN" ] && [ -n "$NODE_BIN" ]; then
        [ -x "$(dirname "$NODE_BIN")/npm" ] && NPM_BIN="$(dirname "$NODE_BIN")/npm"
        [ -x "$(dirname "$NODE_BIN")/npx" ] && NPX_BIN="$(dirname "$NODE_BIN")/npx"
    fi
    if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
        for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
            [ -f "$f" ] || continue
            source "$f" 2>/dev/null || true
            command -v nvm &>/dev/null && { nvm use default >/dev/null 2>&1 || nvm use system >/dev/null 2>&1 || true; }
            command -v node &>/dev/null && NODE_BIN="$(command -v node)"
            command -v npm  &>/dev/null && NPM_BIN="$(command -v npm)"
            command -v npx  &>/dev/null && NPX_BIN="$(command -v npx)"
            [ -n "$NODE_BIN" ] && [ -n "$NPM_BIN" ] && break
        done
    fi
    export PATH
    [ -n "$NODE_BIN" ] && PATH="$(dirname "$NODE_BIN"):$PATH"
}
detect_node_npm

# ============================================================
# 主流程
# ============================================================
info "=========================================="
info "  智能座舱助手 - 启动中"
info "=========================================="

# ---------- 激活虚拟环境 ----------
cd "${BACKEND_DIR}"
VENV_DIR="${BACKEND_DIR}/.venv"
if [ -f "${VENV_DIR}/bin/activate" ]; then
    source "${VENV_DIR}/bin/activate"
elif [ -f "${BACKEND_DIR}/venv/bin/activate" ]; then
    source "${BACKEND_DIR}/venv/bin/activate"
else
    warn "未找到虚拟环境，使用系统 Python"
fi

export PYTHONPATH="${BACKEND_DIR}:${PYTHONPATH}"

# 检查关键模块
if ! python -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
    err "后端依赖缺失！请先运行 ./setup.sh"
    sleep 2
fi

# ---------- 1. 启动后端 FastAPI :8000 ----------
check_port ${BACKEND_PORT} "后端" || true

log "backend" "启动 FastAPI (端口 ${BACKEND_PORT})..."
nohup python -m uvicorn main:app \
    --host 0.0.0.0 --port ${BACKEND_PORT} --reload \
    > "${LOG_DIR}/backend.log" 2>&1 &
BACKEND_PID=$!
echo ${BACKEND_PID} > "${PID_DIR}/backend.pid"
log "backend" "PID: ${BACKEND_PID}"

wait_for_service "http://localhost:${BACKEND_PORT}/api/health" "后端" 25 || true

# ---------- 2. 启动摄像头服务 Flask :7861 (可选) ----------
CAMERA_OK=1
if python -c "import cv2, flask" >/dev/null 2>&1; then
    check_port ${CAMERA_PORT} "摄像头" || true
    log "camera" "启动摄像头+表情识别 (端口 ${CAMERA_PORT})..."
    nohup python camera_server.py --port ${CAMERA_PORT} \
        > "${LOG_DIR}/camera.log" 2>&1 &
    CAMERA_PID=$!
    echo ${CAMERA_PID} > "${PID_DIR}/camera.pid"
    log "camera" "PID: ${CAMERA_PID}"
    wait_for_service "http://localhost:${CAMERA_PORT}/api/health" "摄像头" 30 || CAMERA_OK=0
else
    warn "跳过摄像头服务 (缺少 cv2 / flask)"
fi

# ---------- 3. 启动 TTS 语音合成 :7862 (可选) ----------
TTS_OK=1
if python -c "import edge_tts" >/dev/null 2>&1; then
    check_port ${TTS_PORT} "TTS" || true
    log "tts" "启动 TTS 语音合成 (端口 ${TTS_PORT})..."
    nohup python tts_server.py --port ${TTS_PORT} \
        > "${LOG_DIR}/tts.log" 2>&1 &
    TTS_PID=$!
    echo ${TTS_PID} > "${PID_DIR}/tts.pid"
    log "tts" "PID: ${TTS_PID}"
    wait_for_service "http://localhost:${TTS_PORT}/api/health" "TTS" 15 || TTS_OK=0
else
    warn "跳过 TTS 服务 (缺少 edge_tts)"
fi

# ---------- 4. 启动 Whisper STT :8767 (可选) ----------
WHISPER_OK=1
if python -c "import whisper" >/dev/null 2>&1 || python -c "from faster_whisper import WhisperModel" >/dev/null 2>&1; then
    check_port ${WHISPER_PORT} "Whisper" || true
    log "whisper" "启动 Whisper 语音识别 (端口 ${WHISPER_PORT})..."
    nohup python whisper_server.py --port ${WHISPER_PORT} \
        > "${LOG_DIR}/whisper.log" 2>&1 &
    WHISPER_PID=$!
    echo ${WHISPER_PID} > "${PID_DIR}/whisper.pid"
    log "whisper" "PID: ${WHISPER_PID}"
    wait_for_service "http://localhost:${WHISPER_PORT}/api/health" "Whisper" 60 || WHISPER_OK=0
else
    warn "跳过 Whisper 服务 (缺少 whisper / faster_whisper)"
fi

# ============================================================
# 后端服务启动完毕
# ============================================================
echo ""
info "=========================================="
info "  后端服务启动完毕"
info "=========================================="
echo ""
echo -e "  后端 API:    ${GREEN}http://localhost:${BACKEND_PORT}/api/v1${NC}"
echo -e "  Swagger UI:  ${GREEN}http://localhost:${BACKEND_PORT}/docs${NC}"
if [ $CAMERA_OK -eq 1 ]; then
    echo -e "  摄像头:      ${GREEN}http://localhost:${CAMERA_PORT}/video_feed${NC}"
fi
if [ $TTS_OK -eq 1 ]; then
    echo -e "  TTS 语音:    ${GREEN}http://localhost:${TTS_PORT}/api/health${NC}"
fi
if [ $WHISPER_OK -eq 1 ]; then
    echo -e "  Whisper STT: ${GREEN}http://localhost:${WHISPER_PORT}/api/health${NC}"
fi
echo ""

# ---------- 5. 启动前端 ----------
cd "${PROJECT_DIR}"

if [ -z "$NPM_BIN" ] || [ -z "$NODE_BIN" ]; then
    # 没有 Node.js，尝试用 dist 静态文件
    if [ -f "dist/index.html" ]; then
        info "未找到 Node.js，使用 Python 静态服务器托管 dist/"
        check_port ${FRONTEND_PORT} "前端" || true
        info "=========================================="
        info "  前端页面: ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
        info "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
        info "=========================================="
        exec python -m http.server ${FRONTEND_PORT} --directory dist
    else
        err "未找到 node/npm 且 dist/ 不存在！"
        err "请新开终端执行: npm install && npm run build"
        while true; do sleep 3600; done
    fi
fi

if [ ! -d "node_modules" ]; then
    warn "node_modules 不存在，正在安装前端依赖..."
    "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com || {
        err "前端依赖安装失败"
        if [ -f "dist/index.html" ]; then
            warn "使用 dist 静态文件托管"
            exec python -m http.server ${FRONTEND_PORT} --directory dist
        fi
        while true; do sleep 3600; done
    }
fi

check_port ${FRONTEND_PORT} "前端" || true

echo ""
info "=========================================="
info "  启动前端 Vite (前台运行)"
info "  前端页面: ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
info "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
info "=========================================="
echo ""

export PATH
[ -n "$NODE_BIN" ] && PATH="$(dirname "$NODE_BIN"):$PATH"

if [ -f "node_modules/.bin/vite" ]; then
    exec "node_modules/.bin/vite" --host 0.0.0.0 --port ${FRONTEND_PORT}
else
    exec "$NPM_BIN" run dev
fi
