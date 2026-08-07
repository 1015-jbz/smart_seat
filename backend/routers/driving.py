"""驾驶记录 API 路由

- GET  /driving/sessions        返回驾驶会话列表（分页）
- POST /driving/sessions        创建新驾驶会话
- GET  /driving/sessions/{id}   返回单个会话详情
- PUT  /driving/sessions/{id}/end  结束驾驶会话
- GET  /driving/stats           返回驾驶统计
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import DrivingSession, FatigueEvent
from schemas import (
    DrivingSessionCreate,
    DrivingSessionUpdate,
    DrivingSessionResponse,
)

router = APIRouter(prefix="/driving", tags=["驾驶记录"])


@router.get("/sessions", response_model=None)
async def list_sessions(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """返回驾驶会话列表（分页，按创建时间倒序）。"""
    try:
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size
        query = db.query(DrivingSession).order_by(DrivingSession.created_at.desc())
        total = query.count()
        items = query.offset(offset).limit(page_size).all()
        pages = (total + page_size - 1) // page_size
        return {
            "items": [DrivingSessionResponse.model_validate(i).model_dump() for i in items],
            "meta": {"total": total, "page": page, "page_size": page_size, "pages": pages},
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/sessions", response_model=None)
async def create_session(payload: DrivingSessionCreate, db: Session = Depends(get_db)):
    """创建新驾驶会话。"""
    try:
        session = DrivingSession(
            start_time=payload.start_time or datetime.utcnow(),
            distance_km=payload.distance_km,
            max_speed=payload.max_speed,
            avg_speed=payload.avg_speed,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return DrivingSessionResponse.model_validate(session).model_dump()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


@router.get("/sessions/{session_id}", response_model=None)
async def get_session(session_id: int, db: Session = Depends(get_db)):
    """返回单个会话详情（含其下疲劳事件）。"""
    try:
        session = db.query(DrivingSession).filter(DrivingSession.id == session_id).first()
        if not session:
            return {"error": f"未找到会话 id={session_id}"}
        events = (
            db.query(FatigueEvent)
            .filter(FatigueEvent.session_id == session_id)
            .order_by(FatigueEvent.timestamp.desc())
            .all()
        )
        result = DrivingSessionResponse.model_validate(session).model_dump()
        result["fatigue_events"] = [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "fatigue_score": e.fatigue_score,
                "level": e.level,
                "duration_seconds": e.duration_seconds,
                "action_taken": e.action_taken,
            }
            for e in events
        ]
        return result
    except Exception as e:
        return {"error": str(e)}


@router.put("/sessions/{session_id}/end", response_model=None)
async def end_session(session_id: int, db: Session = Depends(get_db)):
    """结束驾驶会话：自动计算 duration_minutes 与 fatigue_events_count。"""
    try:
        session = db.query(DrivingSession).filter(DrivingSession.id == session_id).first()
        if not session:
            return {"error": f"未找到会话 id={session_id}"}
        now = datetime.utcnow()
        session.end_time = now
        if session.start_time:
            duration = (now - session.start_time).total_seconds() / 60.0
            session.duration_minutes = round(duration, 2)
        # 统计该会话下的疲劳事件数
        fatigue_count = (
            db.query(func.count(FatigueEvent.id))
            .filter(FatigueEvent.session_id == session_id)
            .scalar() or 0
        )
        session.fatigue_events_count = fatigue_count
        db.commit()
        db.refresh(session)
        return DrivingSessionResponse.model_validate(session).model_dump()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


@router.get("/stats", response_model=None)
async def get_driving_stats(db: Session = Depends(get_db)):
    """返回驾驶统计：总里程、总时长、平均速度等。"""
    try:
        total_distance = db.query(
            func.coalesce(func.sum(DrivingSession.distance_km), 0.0)
        ).scalar() or 0.0
        total_minutes = db.query(
            func.coalesce(func.sum(DrivingSession.duration_minutes), 0.0)
        ).scalar() or 0.0
        total_sessions = db.query(func.count(DrivingSession.id)).scalar() or 0
        max_speed = db.query(
            func.coalesce(func.max(DrivingSession.max_speed), 0.0)
        ).scalar() or 0.0
        avg_speed = db.query(
            func.coalesce(func.avg(DrivingSession.avg_speed), 0.0)
        ).scalar() or 0.0
        total_fatigue = db.query(
            func.coalesce(func.sum(DrivingSession.fatigue_events_count), 0)
        ).scalar() or 0

        return {
            "total_distance_km": round(float(total_distance), 2),
            "total_minutes": round(float(total_minutes), 2),
            "total_hours": round(float(total_minutes) / 60.0, 2),
            "total_sessions": total_sessions,
            "max_speed": round(float(max_speed), 1),
            "average_speed": round(float(avg_speed), 1),
            "total_fatigue_events": total_fatigue,
        }
    except Exception as e:
        return {"error": str(e)}
