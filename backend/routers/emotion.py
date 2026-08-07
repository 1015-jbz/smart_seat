"""情绪识别记录 API 路由

- GET  /emotion/records  返回情绪记录历史（分页）
- POST /emotion/records  记录一次情绪识别结果
- GET  /emotion/stats    返回情绪统计（各情绪占比、近期趋势）
- POST /emotion/detect   实时表情检测（base64 图片 → ONNX 推理）
"""
import base64
import logging
from datetime import datetime, timedelta
from io import BytesIO
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from database import get_db
from models import EmotionRecord
from schemas import EmotionRecordCreate, EmotionRecordResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emotion", tags=["情绪识别"])


# ============ 表情检测请求/响应模型（内联，避免污染 schemas.py）============
class EmotionDetectRequest(BaseModel):
    """表情检测请求：前端发送 base64 编码的图片。"""
    image_base64: str = Field(..., description="Base64 编码的图片（JPEG/PNG），可以是全帧或人脸裁剪")
    detect_face: bool = Field(default=True, description="是否在后端做人脸检测（False=认为图片已是人脸裁剪）")


class EmotionDetectResponse(BaseModel):
    """表情检测响应（对齐 smart_cockpit 输出）。"""
    emotion_en: str = "Neutral"
    emotion_zh: str = "平静"
    emoji: str = "😌"
    color: str = "#00d4ff"
    confidence: float = 0.0
    face_box: Optional[list] = None
    face_detected: bool = False
    all_scores: dict = {}
    elapsed_ms: float = 0.0


@router.get("/records", response_model=None)
async def get_emotion_records(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """返回情绪记录历史（分页，按时间倒序）。"""
    try:
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size
        query = db.query(EmotionRecord).order_by(EmotionRecord.timestamp.desc())
        total = query.count()
        items = query.offset(offset).limit(page_size).all()
        pages = (total + page_size - 1) // page_size
        return {
            "items": [EmotionRecordResponse.model_validate(i).model_dump() for i in items],
            "meta": {"total": total, "page": page, "page_size": page_size, "pages": pages},
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/records", response_model=None)
async def create_emotion_record(payload: EmotionRecordCreate, db: Session = Depends(get_db)):
    """记录一次情绪识别结果。"""
    try:
        record = EmotionRecord(
            emotion=payload.emotion,
            confidence=payload.confidence,
            source=payload.source,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return EmotionRecordResponse.model_validate(record).model_dump()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}


@router.get("/stats", response_model=None)
async def get_emotion_stats(
    days: int = 7,
    db: Session = Depends(get_db),
):
    """返回情绪统计：各情绪占比、近期趋势。"""
    try:
        days = max(1, min(90, days))
        since = datetime.utcnow() - timedelta(days=days)

        # 各情绪占比
        rows = (
            db.query(EmotionRecord.emotion, func.count(EmotionRecord.id))
            .filter(EmotionRecord.timestamp >= since)
            .group_by(EmotionRecord.emotion)
            .all()
        )
        total = sum(cnt for _, cnt in rows) or 1
        distribution = {
            emotion: {"count": cnt, "ratio": round(cnt / total, 3)}
            for emotion, cnt in rows
        }

        # 平均置信度
        avg_conf = db.query(
            func.avg(EmotionRecord.confidence)
        ).filter(EmotionRecord.timestamp >= since).scalar() or 0

        # 每日趋势
        daily_rows = (
            db.query(
                func.date(EmotionRecord.timestamp).label("day"),
                EmotionRecord.emotion,
                func.count(EmotionRecord.id),
            )
            .filter(EmotionRecord.timestamp >= since)
            .group_by("day", EmotionRecord.emotion)
            .order_by(desc("day"))
            .all()
        )
        trend = {}
        for day, emotion, cnt in daily_rows:
            day_str = day if isinstance(day, str) else str(day)
            trend.setdefault(day_str, {})[emotion] = cnt

        return {
            "days": days,
            "total_records": total,
            "distribution": distribution,
            "average_confidence": round(float(avg_conf), 3) if avg_conf else 0,
            "daily_trend": trend,
        }
    except Exception as e:
        return {"error": str(e)}


# ============ 新增：实时表情检测 ============

_emotion_engine_ready = False


def _ensure_engine():
    """延迟初始化表情引擎（首次调用时加载 ONNX 模型）。"""
    global _emotion_engine_ready
    if not _emotion_engine_ready:
        from services.emotion_engine import initialize
        initialize()
        _emotion_engine_ready = True


@router.post("/detect", response_model=None)
async def detect_emotion(payload: EmotionDetectRequest):
    """
    实时表情检测 — 接收 base64 图片，返回 ONNX 推理结果。

    流程（对齐 smart_cockpit）:
      1. 解码 base64 → numpy BGR 图像
      2. 如果 detect_face=True: 人脸检测（Haar/MediaPipe）→ 裁剪人脸
      3. ONNX EfficientNet-B2 推理 → 7 类表情
      4. 返回 {emotion_zh, confidence, face_box, all_scores}

    用法:
      前端从 <video> 截帧 → canvas.toDataURL() → POST /emotion/detect
    """
    try:
        _ensure_engine()
        from services.emotion_engine import detect_emotion, classify_face_crop

        # 解码 base64（兼容 data:image/jpeg;base64,xxx 和纯 base64）
        img_b64 = payload.image_base64
        if "," in img_b64:
            img_b64 = img_b64.split(",", 1)[1]

        img_bytes = base64.b64decode(img_b64)
        np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="无法解码图片")

        # 限制图片最大尺寸（避免超大图导致推理过慢）
        h, w = frame.shape[:2]
        max_dim = 1280
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))

        # 人脸检测 + 表情分类
        if payload.detect_face:
            result = detect_emotion(frame)
        else:
            result = classify_face_crop(frame)
            result["face_detected"] = True
            result["face_box"] = None

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"表情检测失败: {e}")
        return {
            "emotion_en": "Neutral",
            "emotion_zh": "平静",
            "emoji": "😌",
            "color": "#00d4ff",
            "confidence": 0.0,
            "face_box": None,
            "face_detected": False,
            "all_scores": {},
            "elapsed_ms": 0.0,
            "error": str(e),
        }
