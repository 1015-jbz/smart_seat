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
    for port in ${BACKEND_PORT} ${CAMERA_PORT} ${FRONTEND_PORT}; do
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

# ---------- 找 Node/npm（脚本内可能没加载 nvm）----------
detect_node_npm() {
    NODE_BIN=""
    NPM_BIN=""
    NPX_BIN=""
    if command -v node &>/dev/null; then NODE_BIN="$(command -v node)"; fi
    if command -v npm  &>/dev/null; then NPM_BIN="$(command -v npm)"; fi
    if command -v npx  &>/dev/null; then NPX_BIN="$(command -v npx)"; fi
    # 常见位置兜底
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
    # 尝试加载 nvm
    if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
        for f in "$HOME/.nvm/nvm.sh" /usr/share/nvm/nvm.sh /etc/profile.d/nvm.sh; do
            [ -f "$f" ] || continue
            # shellcheck disable=SC1090
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
info "  智能座舱助手 - 启动中 (龙芯适配)"
info "=========================================="

# ---------- 1. 启动后端 FastAPI :8000 ----------
check_port ${BACKEND_PORT} "后端" || true

log "backend" "启动 FastAPI (端口 ${BACKEND_PORT})..."
cd "${BACKEND_DIR}"
VENV_DIR="${BACKEND_DIR}/.venv"
if [ -f "${VENV_DIR}/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "${VENV_DIR}/bin/activate"
else
    # 兼容旧的 venv 目录
    if [ -f "${BACKEND_DIR}/venv/bin/activate" ]; then
        # shellcheck disable=SC1091
        source "${BACKEND_DIR}/venv/bin/activate"
    else
        warn "未找到虚拟环境 (.venv / venv)，使用系统 Python"
    fi
fi

export PYTHONPATH="${BACKEND_DIR}:${PYTHONPATH}"

# 检查关键模块
if ! python -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
    err "后端依赖缺失！请先运行 ./setup.sh"
    sleep 2
fi

mkdir -p "${BACKEND_DIR}/data"
nohup python -m uvicorn main:app \
    --host 0.0.0.0 --port ${BACKEND_PORT} --reload \
    > "${LOG_DIR}/backend.log" 2>&1 &
BACKEND_PID=$!
echo ${BACKEND_PID} > "${PID_DIR}/backend.pid"
log "backend" "PID: ${BACKEND_PID}"

if wait_for_service "http://localhost:${BACKEND_PORT}/api/health" "后端" 25; then
    info "后端健康检查通过 ✓"
else
    warn "后端启动超时，查看日志: tail -f ${LOG_DIR}/backend.log"
fi

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

# ============================================================
# 完成 - 打印后端+摄像头地址
# ============================================================
echo ""
info "=========================================="
info "  后端 & 摄像头 启动完毕"
info "=========================================="
echo ""
echo -e "  后端 API:    ${GREEN}http://localhost:${BACKEND_PORT}/api/v1${NC}"
echo -e "  Swagger UI:  ${GREEN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo -e "  健康检查:    ${GREEN}http://localhost:${BACKEND_PORT}/api/health${NC}"
if [ $CAMERA_OK -eq 1 ]; then
    echo -e "  摄像头状态:  ${GREEN}http://localhost:${CAMERA_PORT}/api/state${NC}"
    echo -e "  摄像头视频:  ${GREEN}http://localhost:${CAMERA_PORT}/video_feed${NC}"
fi
echo ""
echo -e "  日志目录:    ${LOG_DIR}/"
echo "    tail -f ${LOG_DIR}/backend.log    # 看后端"
echo "    tail -f ${LOG_DIR}/camera.log     # 看摄像头"
echo ""

# ---------- 3. 启动前端 Vite :5173（前台运行，实时看报错）----------
cd "${PROJECT_DIR}"

if [ -z "$NPM_BIN" ] || [ -z "$NODE_BIN" ]; then
    err "未找到 node/npm，前端无法启动！"
    err "请新开终端执行："
    err "  export NVM_DIR=\"\$HOME/.nvm\" && source \"\$NVM_DIR/nvm.sh\" && nvm use default"
    err "  cd ${PROJECT_DIR} && npm run dev"
    # 不退出，保留后端和摄像头
    while true; do sleep 3600; done
fi

if [ ! -d "node_modules" ]; then
    warn "node_modules 不存在，正在安装前端依赖 (npmmirror)..."
    "$NPM_BIN" install --no-audit --no-fund --registry=https://registry.npmmirror.com || {
        err "前端依赖安装失败，请新开终端手动执行："
        err "  cd ${PROJECT_DIR} && npm install --registry=https://registry.npmmirror.com"
        while true; do sleep 3600; done
    }
fi

check_port ${FRONTEND_PORT} "前端" || true

echo ""
info "=========================================="
info "  启动前端 Vite (前台运行，看实时日志)"
info "  前端页面: ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
info "  ${YELLOW}按 Ctrl+C 停止前端 + 后端 + 摄像头${NC}"
info "=========================================="
echo ""

# 前台跑 Vite：不 nohup，不 &，直接跑
# 好处：1) 报错直接看到；2) SIGINT 触发 trap cleanup 把后端一起带走
export PATH
[ -n "$NODE_BIN" ] && PATH="$(dirname "$NODE_BIN"):$PATH"

if [ -f "node_modules/.bin/vite" ]; then
    # 优先用本地 vite，不走 npx 中间层，龙芯上更稳
    exec "node_modules/.bin/vite" --host 0.0.0.0 --port ${FRONTEND_PORT}
else
    # 兜底走 npm run dev（vite.config.js 里已配 host+port）
    exec "$NPM_BIN" run dev
fi
