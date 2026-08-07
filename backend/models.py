"""数据库 ORM 模型

表清单：
- DrivingSession  驾驶会话
- FatigueEvent    疲劳事件
- EmotionRecord   情绪记录
- UserSetting     用户设置（KV 表）
- VehicleState    车辆状态快照
"""
from datetime import datetime

from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text

from database import Base


class DrivingSession(Base):
    """驾驶会话：一次完整驾驶过程的汇总。"""
    __tablename__ = "driving_sessions"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Float, default=0.0)
    distance_km = Column(Float, default=0.0)
    max_speed = Column(Float, default=0.0)
    avg_speed = Column(Float, default=0.0)
    fatigue_events_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class FatigueEvent(Base):
    """疲劳事件：检测到一次疲劳告警的记录。"""
    __tablename__ = "fatigue_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("driving_sessions.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    fatigue_score = Column(Integer, nullable=False)
    level = Column(String(16), nullable=False)  # 轻微/中度/严重
    duration_seconds = Column(Integer, default=0)
    action_taken = Column(String(64), default="")  # 采取的措施（如：提醒、建议休息）


class EmotionRecord(Base):
    """情绪识别记录。"""
    __tablename__ = "emotion_records"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    emotion = Column(String(32), nullable=False)  # happy/neutral/sad/angry/surprised
    confidence = Column(Float, default=0.0)
    source = Column(String(16), default="camera")  # camera/manual


class UserSetting(Base):
    """用户设置：KV 表，用于持久化主题、字体大小、用户名等。"""
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), unique=True, nullable=False, index=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VehicleState(Base):
    """车辆状态快照：定时记录的车辆数据。"""
    __tablename__ = "vehicle_states"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    speed = Column(Float, default=0.0)
    rpm = Column(Float, default=0.0)
    fuel = Column(Float, default=100.0)
    temperature = Column(Float, default=90.0)
    tire_pressure_fl = Column(Float, default=2.4)
    tire_pressure_fr = Column(Float, default=2.4)
    tire_pressure_rl = Column(Float, default=2.4)
    tire_pressure_rr = Column(Float, default=2.4)
