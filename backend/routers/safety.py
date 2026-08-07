"""安全监控 API 路由

- GET  /safety/fatigue           返回当前疲劳评分和等级
- POST /safety/fatigue/event     记录一次疲劳事件
- GET  /safety/fatigue/history   返回疲劳事件历史
- GET  /safety/stats             返回安全统计
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db
from models import FatigueEvent, DrivingSession
from schemas import FatigueEventCreate, FatigueEventResponse
from services.fatigue import calculate_fatigue_score, is_night_time

router = APIRouter(prefix="/safety", tags=["安全监控"])


@router.get("/fatigue", response_model=None)
async def get_current_fatigue(
    driving_minutes: float = Query(0.0, description="本次累计驾驶时长（分钟）"),
    continuous_minutes: float = Query(0.0, description="连续未休息驾驶时长（分钟）"),
    break_count: int = Query(0, description="已休息次数"),
):
    """返回当前疲劳评分和等级。"""
    try:
        now = datetime.utcnow()
        # is_night 以 UTC+8 计算（前端时区为 Asia/Shanghai）
        sh_hour = (datetime.utcnow() + timedelta(hours=8)).hour
        is_night = is_night_time(sh_hour)
        result = calculate_fatigue_score(
            driving_minutes=driving_minutes,
            is_night=is_night,
            continuous_minutes=continuous_minutes,
            break_count=break_count,
        )
        return {
            "score": result["score"],
            "level": result["level"],
            "advice": result["advice"],
            "is_night": is_night,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/fatigue/event", response_model=None)
async def record_fatigue_event(payload: FatigueEventCreate, db: Session = Depends(get_db)):
    """记录一次疲劳事件。"""
    try:
        event = FatigueEvent(
            session_id=payload.session_id,
            fatigue_score=payload.fatigue_score,
            level=payload.level,
            duration_seconds=payload.duration_seconds,
            action_taken=payload.action_taken,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return FatigueEventResponse.model_validate(event).model_dump()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


@router.get("/fatigue/history", response_model=None)
async def get_fatigue_history(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """返回疲劳事件历史（分页，按时间倒序）。"""
    try:
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size
        query = db.query(FatigueEvent).order_by(FatigueEvent.timestamp.desc())
        total = query.count()
        items = query.offset(offset).limit(page_size).all()
        pages = (total + page_size - 1) // page_size
        return {
            "items": [FatigueEventResponse.model_validate(i).model_dump() for i in items],
            "meta": {"total": total, "page": page, "page_size": page_size, "pages": pages},
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/stats", response_model=None)
async def get_safety_stats(db: Session = Depends(get_db)):
    """返回安全统计：总驾驶时长、疲劳事件次数、平均疲劳分等。"""
    try:
        # 总驾驶时长（分钟）— 汇总所有已结束会话
        total_minutes = db.query(func.coalesce(func.sum(DrivingSession.duration_minutes), 0.0)).scalar() or 0.0
        # 疲劳事件总数
        fatigue_count = db.query(func.count(FatigueEvent.id)).scalar() or 0
        # 平均疲劳分
        avg_score = db.query(func.avg(FatigueEvent.fatigue_score)).scalar() or 0
        # 各等级分布
        level_dist_rows = (
            db.query(FatigueEvent.level, func.count(FatigueEvent.id))
            .group_by(FatigueEvent.level)
            .all()
        )
        level_distribution = {level: cnt for level, cnt in level_dist_rows}
        # 最近 7 天疲劳事件数
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_count = (
            db.query(func.count(FatigueEvent.id))
            .filter(FatigueEvent.timestamp >= seven_days_ago)
            .scalar() or 0
        )
        return {
            "total_driving_minutes": float(total_minutes),
            "fatigue_events_count": fatigue_count,
            "average_fatigue_score": round(float(avg_score), 1) if avg_score else 0,
            "level_distribution": level_distribution,
            "recent_7days_fatigue_count": recent_count,
        }
    except Exception as e:
        return {"error": str(e)}
