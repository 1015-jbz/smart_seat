"""Pydantic 请求/响应模型

为每个 ORM 模型提供 Create / Update / Response 三件套，
并补充车辆状态、天气响应、定位响应等 schema。
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ============ 通用响应 ============
class ErrorResponse(BaseModel):
    error: str


# ============ 驾驶会话 ============
class DrivingSessionCreate(BaseModel):
    start_time: Optional[datetime] = None
    distance_km: float = 0.0
    max_speed: float = 0.0
    avg_speed: float = 0.0


class DrivingSessionUpdate(BaseModel):
    end_time: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    distance_km: Optional[float] = None
    max_speed: Optional[float] = None
    avg_speed: Optional[float] = None
    fatigue_events_count: Optional[int] = None


class DrivingSessionResponse(BaseModel):
    id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_minutes: float
    distance_km: float
    max_speed: float
    avg_speed: float
    fatigue_events_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============ 疲劳事件 ============
class FatigueEventCreate(BaseModel):
    session_id: Optional[int] = None
    fatigue_score: int = Field(..., ge=0, le=100)
    level: str
    duration_seconds: int = 0
    action_taken: str = ""


class FatigueEventResponse(BaseModel):
    id: int
    session_id: Optional[int] = None
    timestamp: datetime
    fatigue_score: int
    level: str
    duration_seconds: int
    action_taken: str

    class Config:
        from_attributes = True


# ============ 情绪记录 ============
class EmotionRecordCreate(BaseModel):
    emotion: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    source: str = "camera"


class EmotionRecordResponse(BaseModel):
    id: int
    timestamp: datetime
    emotion: str
    confidence: float
    source: str

    class Config:
        from_attributes = True


# ============ 用户设置 ============
class UserSettingUpsert(BaseModel):
    key: str
    value: str


class UserSettingResponse(BaseModel):
    id: int
    key: str
    value: str
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ 车辆状态 ============
class VehicleStateCreate(BaseModel):
    speed: float = 0.0
    rpm: float = 0.0
    fuel: float = 100.0
    temperature: float = 90.0
    tire_pressure_fl: float = 2.4
    tire_pressure_fr: float = 2.4
    tire_pressure_rl: float = 2.4
    tire_pressure_rr: float = 2.4


class VehicleStateResponse(VehicleStateCreate):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


# ============ 天气 ============
class WeatherNow(BaseModel):
    """实时天气，字段对齐前端 weatherApi.js 的 now 对象。"""
    temperature: int
    feels_like: int
    condition: str
    icon: str
    humidity: float
    wind_speed: int
    wind_dir: str
    wind_scale: str = ""
    pressure: int
    visibility: float
    cloud: Optional[float] = None
    dew_point: Optional[float] = None
    uv_index: Optional[float] = None
    real: bool = True
    update_time: str


class WeatherForecastDay(BaseModel):
    date: str
    day: int
    temp_max: int
    temp_min: int
    condition: str
    icon: str
    wind_dir_day: str = ""
    wind_scale_day: str = ""


class WeatherResponse(BaseModel):
    now: WeatherNow
    forecast: List[WeatherForecastDay]


# ============ 定位 ============
class LocationResponse(BaseModel):
    city: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    pro: Optional[str] = None
    source: str = "ip"


# ============ 疲劳评分 ============
class FatigueScoreRequest(BaseModel):
    driving_minutes: float = 0.0
    is_night: bool = False
    continuous_minutes: float = 0.0
    break_count: int = 0


class FatigueScoreResponse(BaseModel):
    score: int
    level: str
    advice: str


# ============ 分页 ============
class PaginatedMeta(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
