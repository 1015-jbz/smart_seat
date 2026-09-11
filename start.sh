#!/bin/bash
# ============================================================
# 智能座舱助手 - 一键启动
# ============================================================
# 用法: chmod +x start.sh && ./start.sh
# 停止: Ctrl+C
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
LOG_DIR="${PROJECT_DIR}/logs"
PID_DIR="${PROJECT_DIR}/.pids"

BACKEND_PORT=8000
CAMERA_PORT=7861
TTS_PORT=7862
FRONTEND_PORT=5173

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR ]${NC}  $1"; }
log()   { echo -e "${BLUE}[$1]${NC} $2"; }

mkdir -p "${LOG_DIR}" "${PID_DIR}"

# ---------- 清理 ----------
cleanup() {
    echo ""
    info "停止所有服务..."
    for pidfile in "${PID_DIR}"/*.pid; do
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        kill "$pid" 2>/dev/null && log "$name" "已停止 (PID: $pid)" || true
        rm -f "$pidfile"
    done
    for port in ${BACKEND_PORT} ${CAMERA_PORT} ${TTS_PORT} ${FRONTEND_PORT}; do
        pids=$(lsof -ti:${port} 2>/dev/null || ss -lntn "sport = :${port}" 2>/dev/null | awk 'NR>1{print $6}' | grep -oP 'pid=\K[0-9]+' | sort -u || true)
        [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done
    info "所有服务已停止"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ---------- 等待就绪 ----------
wait_for() {
    local url=$1 name=$2 max=${3:-30} i=0
    while [ $i -lt $max ]; do
        curl -sf "$url" >/dev/null 2>&1 && { info "$name 就绪 ✓"; return 0; }
        sleep 1; i=$((i+1))
    done
    warn "$name 启动超时"
    return 1
}

# ---------- 找 node ----------
detect_node() {
    NODE_BIN="" NPM_BIN=""
    command -v node &>/dev/null && NODE_BIN="$(command -v node)"
    command -v npm  &>/dev/null && NPM_BIN="$(command -v npm)"
    if [ -z "$NODE_BIN" ]; then
        for p in /usr/local/bin/node /usr/bin/node "$HOME/.nvm/versions/node"/*/bin/node; do
            [ -z "$NODE_BIN" ] && [ -x "$p" ] && NODE_BIN="$p"
        done
    fi
    [ -z "$NPM_BIN" ] && [ -n "$NODE_BIN" ] && [ -x "$(dirname "$NODE_BIN")/npm" ] && NPM_BIN="$(dirname "$NODE_BIN")/npm"
    if [ -z "$NODE_BIN" ]; then
        for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
            [ -f "$f" ] && source "$f" 2>/dev/null || true
            command -v node &>/dev/null && NODE_BIN="$(command -v node)"
            command -v npm  &>/dev/null && NPM_BIN="$(command -v npm)"
            [ -n "$NODE_BIN" ] && break
        done
    fi
    [ -n "$NODE_BIN" ] && export PATH="$(dirname "$NODE_BIN"):$PATH"
}
detect_node

# ---------- 激活虚拟环境 ----------
cd "$BACKEND_DIR"
VENV_DIR="${BACKEND_DIR}/.venv"
if [ -f "${VENV_DIR}/bin/activate" ]; then
    source "${VENV_DIR}/bin/activate"
else
    warn "未找到 .venv，使用系统 Python"
fi
export PYTHONPATH="${BACKEND_DIR}:${PYTHONPATH}"

# ============================================================
echo ""
info "=========================================="
info "  智能座舱助手 - 启动中"
info "=========================================="

# ---------- 1. 后端 FastAPI :8000 ----------
log "backend" "启动 (端口 ${BACKEND_PORT})..."
nohup python -m uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT} --reload \
    > "${LOG_DIR}/backend.log" 2>&1 &
echo $! > "${PID_DIR}/backend.pid"
log "backend" "PID: $(cat ${PID_DIR}/backend.pid)"
wait_for "http://localhost:${BACKEND_PORT}/api/health" "后端" 25 || true

# ---------- 2. 摄像头 :7861 ----------
if python -c "import cv2, flask" >/dev/null 2>&1; then
    log "camera" "启动 (端口 ${CAMERA_PORT})..."
    nohup python camera_server.py --port ${CAMERA_PORT} \
        > "${LOG_DIR}/camera.log" 2>&1 &
    echo $! > "${PID_DIR}/camera.pid"
    log "camera" "PID: $(cat ${PID_DIR}/camera.pid)"
    wait_for "http://localhost:${CAMERA_PORT}/api/health" "摄像头" 30 || true
else
    warn "跳过摄像头 (缺少 cv2/flask)"
fi

# ---------- 3. TTS :7862 ----------
if python -c "import edge_tts" >/dev/null 2>&1; then
    log "tts" "启动 (端口 ${TTS_PORT})..."
    nohup python tts_server.py --port ${TTS_PORT} \
        > "${LOG_DIR}/tts.log" 2>&1 &
    echo $! > "${PID_DIR}/tts.pid"
    log "tts" "PID: $(cat ${PID_DIR}/tts.pid)"
    wait_for "http://localhost:${TTS_PORT}/api/health" "TTS" 15 || true
else
    warn "跳过 TTS (缺少 edge_tts)"
fi

# ---------- 状态 ----------
echo ""
info "=========================================="
info "  后端服务启动完毕"
info "=========================================="
echo -e "  后端 API:    ${GREEN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo -e "  摄像头:      ${GREEN}http://localhost:${CAMERA_PORT}/video_feed${NC}"
echo -e "  TTS 语音:    ${GREEN}http://localhost:${TTS_PORT}/api/health${NC}"
echo ""

# ---------- 4. 前端 ----------
cd "$PROJECT_DIR"

if [ -n "$NODE_BIN" ] && [ -n "$NPM_BIN" ]; then
    if [ ! -d "node_modules" ]; then
        warn "安装前端依赖..."
        "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com || true
    fi
    if [ -f "node_modules/.bin/vite" ]; then
        info "=========================================="
        info "  前端: ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
        info "  ${YELLOW}Ctrl+C 停止所有服务${NC}"
        info "=========================================="
        exec "node_modules/.bin/vite" --host 0.0.0.0 --port ${FRONTEND_PORT}
    else
        exec "$NPM_BIN" run dev
    fi
elif [ -f "dist/index.html" ]; then
    # 没有 Node.js，用 Python 托管静态文件
    info "没有 Node.js，使用 dist/ 静态托管"
    info "=========================================="
    info "  前端: ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
    info "  ${YELLOW}Ctrl+C 停止所有服务${NC}"
    info "=========================================="
    exec python -m http.server ${FRONTEND_PORT} --directory dist
else
    err "无 Node.js 且 dist/ 不存在！"
    err "请安装 Node.js 后执行: npm install && npm run build"
    while true; do sleep 3600; done
fi
