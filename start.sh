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
log()   { echo -e "${BLUE}[${1}]${NC} $2"; }

# ---------- 初始化 ----------
mkdir -p "${LOG_DIR}" "${PID_DIR}"

# ---------- 清理函数 ----------
cleanup() {
    echo ""
    info "正在停止所有服务..."
    for pidfile in "${PID_DIR}"/*.pid; do
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile")
            local name=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null && log "$name" "已停止 (PID: $pid)" || true
            fi
            rm -f "$pidfile"
        fi
    done
    # 兜底：按端口杀残留
    for port in ${BACKEND_PORT} ${CAMERA_PORT}; do
        local pids=$(lsof -ti:${port} 2>/dev/null || true)
        [ -n "$pids" ] && kill $pids 2>/dev/null || true
    done
    info "所有服务已停止"
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ---------- 端口检查 ----------
check_port() {
    local port=$1
    local name=$2
    if lsof -Pi :${port} -sTCP:LISTEN -t >/dev/null 2>&1; then
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
        if curl -s "${url}" >/dev/null 2>&1; then
            info "${name} 就绪 → ${url}"
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    warn "${name} 启动超时 (${max_wait}s)"
    return 1
}

# ============================================================
# 1. 启动后端 (FastAPI :8000)
# ============================================================
info "=========================================="
info "  智能座舱助手 - 启动中..."
info "=========================================="

check_port ${BACKEND_PORT} "后端" || true

log "backend" "启动 FastAPI 服务 (端口 ${BACKEND_PORT})..."
cd "${BACKEND_DIR}"
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    warn "未找到 venv，使用系统 Python"
fi

python main.py > "${LOG_DIR}/backend.log" 2>&1 &
BACKEND_PID=$!
echo ${BACKEND_PID} > "${PID_DIR}/backend.pid"
log "backend" "PID: ${BACKEND_PID}"

wait_for_service "http://localhost:${BACKEND_PORT}/api/health" "后端" 20

# ============================================================
# 2. 启动摄像头服务 (Flask :7861)
# ============================================================
check_port ${CAMERA_PORT} "摄像头" || true

log "camera" "启动摄像头+表情识别服务 (端口 ${CAMERA_PORT})..."
python camera_server.py --port ${CAMERA_PORT} > "${LOG_DIR}/camera.log" 2>&1 &
CAMERA_PID=$!
echo ${CAMERA_PID} > "${PID_DIR}/camera.pid"
log "camera" "PID: ${CAMERA_PID}"

wait_for_service "http://localhost:${CAMERA_PORT}/api/health" "摄像头" 30

# ============================================================
# 3. 启动前端 (Vite :5173)
# ============================================================
cd "${PROJECT_DIR}"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    warn "node_modules 不存在，正在安装..."
    npm install --no-audit --no-fund
fi

log "frontend" "启动 Vite 开发服务器 (端口 ${FRONTEND_PORT})..."
npx vite --port ${FRONTEND_PORT} --host 0.0.0.0 > "${LOG_DIR}/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo ${FRONTEND_PID} > "${PID_DIR}/frontend.pid"
log "frontend" "PID: ${FRONTEND_PID}"

# ============================================================
# 完成
# ============================================================
echo ""
info "=========================================="
info "  全部服务已启动！"
info "=========================================="
echo ""
echo -e "  前端页面:    ${GREEN}http://localhost:${FRONTEND_PORT}${NC}"
echo -e "  后端 API:    ${GREEN}http://localhost:${BACKEND_PORT}/api/v1${NC}"
echo -e "  健康检查:    ${GREEN}http://localhost:${BACKEND_PORT}/api/health${NC}"
echo -e "  摄像头状态:  ${GREEN}http://localhost:${CAMERA_PORT}/api/state${NC}"
echo -e "  摄像头视频:  ${GREEN}http://localhost:${CAMERA_PORT}/video_feed${NC}"
echo ""
echo -e "  日志目录:    ${LOG_DIR}/"
echo -e "  ${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 保持前台运行，等待任意子进程退出
wait
