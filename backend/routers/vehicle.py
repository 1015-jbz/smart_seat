"""车辆数据 API 路由

- GET    /vehicle/state    返回当前车辆状态（来自硬件模拟器）
- POST   /vehicle/state    记录车辆状态快照到数据库
- GET    /vehicle/history  返回历史车辆状态（分页）
- WebSocket /ws/vehicle     每秒推送一次模拟车辆数据
"""
import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from database import get_db
from models import VehicleState
from schemas import VehicleStateCreate, VehicleStateResponse, ErrorResponse
from services.hardware_sim import simulator
from config import WS_PUSH_INTERVAL

router = APIRouter(prefix="/vehicle", tags=["车辆数据"])


@router.get("/state", response_model=None)
async def get_vehicle_state():
    """返回当前车辆状态（来自硬件模拟器实时数据）。"""
    try:
        state = simulator.get_current_state()
        # 补充分组字段，便于前端使用
        state["tire_pressure"] = [
            state.get("tire_pressure_fl", 2.4),
            state.get("tire_pressure_fr", 2.4),
            state.get("tire_pressure_rl", 2.4),
            state.get("tire_pressure_rr", 2.4),
        ]
        state["behavior_events"] = simulator.get_driving_behavior_events(limit=5)
        return state
    except Exception as e:
        return {"error": str(e)}


@router.post("/state", response_model=None)
async def record_vehicle_state(payload: VehicleStateCreate, db: Session = Depends(get_db)):
    """记录一次车辆状态快照到数据库。"""
    try:
        record = VehicleState(
            speed=payload.speed,
            rpm=payload.rpm,
            fuel=payload.fuel,
            temperature=payload.temperature,
            tire_pressure_fl=payload.tire_pressure_fl,
            tire_pressure_fr=payload.tire_pressure_fr,
            tire_pressure_rl=payload.tire_pressure_rl,
            tire_pressure_rr=payload.tire_pressure_rr,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return VehicleStateResponse.model_validate(record).model_dump()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


@router.get("/history", response_model=None)
async def get_vehicle_history(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """返回历史车辆状态（分页，按时间倒序）。"""
    try:
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size
        query = db.query(VehicleState).order_by(VehicleState.timestamp.desc())
        total = query.count()
        items = query.offset(offset).limit(page_size).all()
        pages = (total + page_size - 1) // page_size
        return {
            "items": [VehicleStateResponse.model_validate(i).model_dump() for i in items],
            "meta": {"total": total, "page": page, "page_size": page_size, "pages": pages},
        }
    except Exception as e:
        return {"error": str(e)}


# ============ WebSocket 实时推送 ============
@router.websocket("/ws/vehicle")
async def vehicle_websocket(websocket: WebSocket):
    """每秒推送一次模拟车辆数据。

    推送数据格式：
      { timestamp, speed, rpm, fuel, temperature,
        tire_pressure: [fl, fr, rl, rr] }
    """
    await websocket.accept()
    try:
        # 确保 simulator 后台线程在跑
        simulator.start_simulation()
        while True:
            state = simulator.get_current_state()
            payload = {
                "timestamp": state.get("timestamp", datetime.utcnow().isoformat()),
                "speed": state.get("speed", 0),
                "rpm": state.get("rpm", 0),
                "fuel": state.get("fuel", 100),
                "temperature": state.get("temperature", 90),
                "tire_pressure": [
                    state.get("tire_pressure_fl", 2.4),
                    state.get("tire_pressure_fr", 2.4),
                    state.get("tire_pressure_rl", 2.4),
                    state.get("tire_pressure_rr", 2.4),
                ],
            }
            await websocket.send_text(json.dumps(payload, ensure_ascii=False))
            await asyncio.sleep(WS_PUSH_INTERVAL)
    except WebSocketDisconnect:
        # 客户端正常断开，静默
        return
    except Exception as e:
        # 其他异常尽量通知客户端再关闭
        try:
            await websocket.send_text(json.dumps({"error": str(e)}, ensure_ascii=False))
        except Exception:
            pass
