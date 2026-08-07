"""FastAPI 应用入口

- 创建 FastAPI app，title="智能座舱助手 API"
- 配置 CORS 允许 localhost:5173 / localhost:3000
- 启动时创建数据库表
- 挂载所有路由到 /api/v1 前缀
- 添加 WebSocket 端点 /ws/vehicle（实时推送车辆数据）
- 添加健康检查 GET /api/health
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS, CORS_ORIGIN_REGEX, API_V1_PREFIX
from database import init_db
from routers import vehicle, safety, weather, location, emotion, driving, chat

logger = logging.getLogger("smart_cabin")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时建表，结束时关闭硬件模拟器。"""
    # 启动：创建数据库表
    init_db()
    print("[startup] 数据库表已就绪")
    # hardware_sim 在 import 时已自启，这里无需再启动
    yield
    # 关闭：停止硬件模拟器后台线程
    from services.hardware_sim import simulator
    simulator.stop_simulation()
    print("[shutdown] 硬件模拟器已停止")


app = FastAPI(
    title="智能座舱助手 API",
    description="智能座舱多模态交互终端后端服务",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置：允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ 全局异常处理：避免暴露内部错误细节 ============
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"未处理异常 {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误，请稍后重试"})

# ============ 健康检查（独立于 /api/v1 前缀，挂在 /api 下）============
@app.get("/api/health", tags=["系统"])
async def health_check():
    """健康检查端点。"""
    return {"status": "ok"}


# ============ 挂载业务路由到 /api/v1 ============
app.include_router(vehicle.router, prefix=API_V1_PREFIX)
app.include_router(safety.router, prefix=API_V1_PREFIX)
app.include_router(weather.router, prefix=API_V1_PREFIX)
app.include_router(location.router, prefix=API_V1_PREFIX)
app.include_router(emotion.router, prefix=API_V1_PREFIX)
app.include_router(driving.router, prefix=API_V1_PREFIX)
app.include_router(chat.router, prefix=API_V1_PREFIX)

# 注意：WebSocket 路由已在 vehicle.router 中定义，前缀 /vehicle
# 挂载到 /api/v1 后实际路径为 /api/v1/vehicle/ws/vehicle。
# 为兼容任务要求的 /ws/vehicle 顶级路径，这里额外注册一次。
# （vehicle.router 的 websocket 装饰器使用的是相对路径 ws/vehicle，
#  由于 include_router 时已加 prefix，该 WS 实际路径为 /api/v1/vehicle/ws/vehicle。）
# 同时再提供一个顶级 /ws/vehicle 入口：直接复用同一个处理函数。
app.websocket("/ws/vehicle")(vehicle.vehicle_websocket)


if __name__ == "__main__":
    import uvicorn
    from config import HOST, PORT
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
