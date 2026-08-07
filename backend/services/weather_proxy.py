"""Open-Meteo 天气代理服务

- 异步请求 Open-Meteo API
- WMO 天气代码转中文描述
- 内存缓存（10 分钟 TTL）
- 返回格式与前端 weatherApi.js 兼容
"""
import time
from typing import Dict, Optional, Tuple

import httpx

from config import OPEN_METEO_URL, API_TIMEOUT, WEATHER_CACHE_TTL

# WMO 天气代码 → 中文描述 + 图标 key（与前端 weatherApi.js 一致）
WMO_MAP = {
    0: ("晴", "sun"),
    1: ("大部晴朗", "cloud"),
    2: ("多云", "cloud"),
    3: ("阴", "cloud"),
    45: ("雾", "cloud"),
    48: ("雾凇", "cloud"),
    51: ("毛毛雨", "cloud-rain"),
    53: ("毛毛雨", "cloud-rain"),
    55: ("大毛毛雨", "cloud-rain"),
    56: ("冻毛毛雨", "cloud-rain"),
    57: ("强冻毛毛雨", "cloud-rain"),
    61: ("小雨", "cloud-rain"),
    63: ("中雨", "cloud-rain"),
    65: ("大雨", "cloud-rain"),
    66: ("冻雨", "cloud-rain"),
    67: ("强冻雨", "cloud-rain"),
    71: ("小雪", "cloud"),
    73: ("中雪", "cloud"),
    75: ("大雪", "cloud"),
    77: ("雪粒", "cloud"),
    80: ("阵雨", "cloud-rain"),
    81: ("中阵雨", "cloud-rain"),
    82: ("强阵雨", "cloud-rain"),
    85: ("小阵雪", "cloud"),
    86: ("强阵雪", "cloud"),
    95: ("雷暴", "cloud-rain"),
    96: ("雷暴伴小冰雹", "cloud-rain"),
    99: ("雷暴伴大冰雹", "cloud-rain"),
}

# 八方位中文
_WIND_DIRS = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"]


def wmo_to_desc(code: int) -> str:
    return WMO_MAP.get(code, ("未知", "cloud"))[0]


def wmo_to_icon(code: int) -> str:
    return WMO_MAP.get(code, ("未知", "cloud"))[1]


def deg_to_dir(deg: float) -> str:
    """风向角度转中文方位。"""
    try:
        idx = round(float(deg) / 45) % 8
    except (TypeError, ValueError):
        return ""
    return _WIND_DIRS[idx]


# 内存缓存：key = (lat, lon) → (timestamp, data)
_cache: Dict[Tuple[float, float], Tuple[float, dict]] = {}


def _cache_key(lat: float, lon: float) -> Tuple[float, float]:
    return (round(lat, 3), round(lon, 3))


def _get_cache(lat: float, lon: float) -> Optional[dict]:
    key = _cache_key(lat, lon)
    entry = _cache.get(key)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > WEATHER_CACHE_TTL:
        _cache.pop(key, None)
        return None
    return data


def _set_cache(lat: float, lon: float, data: dict) -> None:
    _cache[_cache_key(lat, lon)] = (time.time(), data)


async def fetch_weather(lat: float, lon: float) -> Optional[dict]:
    """获取实时天气 + 7 天预报。

    返回结构对齐前端：
      {
        "now": { temperature, feels_like, condition, icon, humidity,
                 wind_speed, wind_dir, wind_scale, pressure, visibility,
                 cloud, dew_point, uv_index, real, update_time },
        "forecast": [ { date, day, temp_max, temp_min, condition, icon,
                        wind_dir_day, wind_scale_day }, ... ]
      }
    """
    # 命中缓存直接返回
    cached = _get_cache(lat, lon)
    if cached:
        return cached

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,"
                   "wind_direction_10m,pressure_msl,visibility,weather_code,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "timezone": "Asia/Shanghai",
        "forecast_days": 7,
    }

    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        # 请求失败返回 None，路由层会兜底
        print(f"[weather_proxy] 请求 Open-Meteo 失败: {e}")
        return None

    try:
        c = data["current"]
        now = {
            "temperature": round(c.get("temperature_2m", 0)),
            "feels_like": round(c.get("temperature_2m", 0)),
            "condition": wmo_to_desc(c.get("weather_code", 0)),
            "icon": wmo_to_icon(c.get("weather_code", 0)),
            "humidity": c.get("relative_humidity_2m", 0),
            "wind_speed": round(c.get("wind_speed_10m", 0)),
            "wind_dir": deg_to_dir(c.get("wind_direction_10m", 0)),
            "wind_scale": "",
            "pressure": round(c.get("pressure_msl", 0)),
            "visibility": round(c.get("visibility", 10000) / 1000) if c.get("visibility") else 10,
            "cloud": None,
            "dew_point": None,
            "uv_index": None,
            "real": True,
            "update_time": c.get("time", ""),
        }

        daily = data.get("daily", {})
        times = daily.get("time", [])
        t_max = daily.get("temperature_2m_max", [])
        t_min = daily.get("temperature_2m_min", [])
        codes = daily.get("weather_code", [])

        forecast = []
        from datetime import datetime as _dt
        for i, date_str in enumerate(times):
            try:
                day = _dt.strptime(date_str, "%Y-%m-%d").weekday()
            except Exception:
                day = 0
            forecast.append({
                "date": date_str,
                "day": day,
                "temp_max": round(t_max[i]) if i < len(t_max) else 0,
                "temp_min": round(t_min[i]) if i < len(t_min) else 0,
                "condition": wmo_to_desc(codes[i]) if i < len(codes) else "未知",
                "icon": wmo_to_icon(codes[i]) if i < len(codes) else "cloud",
                "wind_dir_day": "",
                "wind_scale_day": "",
            })

        result = {"now": now, "forecast": forecast}
        _set_cache(lat, lon, result)
        return result
    except Exception as e:
        print(f"[weather_proxy] 解析天气数据失败: {e}")
        return None


# ============ 城市坐标库 ============
# 与前端 VehicleStore.jsx 的 CITY_COORDS 完全一致
CITY_COORDS = [
    # 直辖市 & 一线
    {"lat": 39.9042, "lon": 116.4074, "name": "北京"},
    {"lat": 31.2304, "lon": 121.4737, "name": "上海"},
    {"lat": 23.1291, "lon": 113.2644, "name": "广州"},
    {"lat": 22.5431, "lon": 114.0579, "name": "深圳"},
    {"lat": 39.3434, "lon": 117.3616, "name": "天津"},
    {"lat": 29.5630, "lon": 106.5516, "name": "重庆"},
    # 河北
    {"lat": 37.0692, "lon": 114.5048, "name": "邢台"},
    {"lat": 38.0428, "lon": 114.5149, "name": "石家庄"},
    {"lat": 39.0842, "lon": 117.2008, "name": "廊坊"},
    {"lat": 38.8671, "lon": 115.4646, "name": "保定"},
    {"lat": 40.9781, "lon": 117.9400, "name": "承德"},
    {"lat": 39.6047, "lon": 118.1802, "name": "唐山"},
    {"lat": 39.5377, "lon": 116.6837, "name": "张家口"},
    {"lat": 37.8455, "lon": 112.5503, "name": "太原"},
    # 沿海 & 华东
    {"lat": 30.2741, "lon": 120.1551, "name": "杭州"},
    {"lat": 32.0603, "lon": 118.7969, "name": "南京"},
    {"lat": 31.8206, "lon": 117.2272, "name": "合肥"},
    {"lat": 26.0745, "lon": 119.2965, "name": "福州"},
    {"lat": 24.4798, "lon": 118.0894, "name": "厦门"},
    {"lat": 36.0671, "lon": 120.3826, "name": "青岛"},
    {"lat": 36.6512, "lon": 117.1201, "name": "济南"},
    {"lat": 29.8683, "lon": 121.5440, "name": "宁波"},
    {"lat": 31.2990, "lon": 120.5853, "name": "苏州"},
    {"lat": 31.5688, "lon": 120.3058, "name": "无锡"},
    # 华中 & 西部
    {"lat": 30.5728, "lon": 104.0668, "name": "成都"},
    {"lat": 34.3416, "lon": 108.9398, "name": "西安"},
    {"lat": 30.5928, "lon": 114.3055, "name": "武汉"},
    {"lat": 28.2282, "lon": 112.9388, "name": "长沙"},
    {"lat": 26.6470, "lon": 106.6302, "name": "贵阳"},
    {"lat": 25.0389, "lon": 102.7183, "name": "昆明"},
    {"lat": 36.0611, "lon": 103.8343, "name": "兰州"},
    {"lat": 43.8171, "lon": 87.6166, "name": "乌鲁木齐"},
    {"lat": 36.6171, "lon": 101.7782, "name": "西宁"},
    {"lat": 38.4872, "lon": 106.2309, "name": "银川"},
    {"lat": 40.8426, "lon": 111.7519, "name": "呼和浩特"},
    # 东北
    {"lat": 45.8038, "lon": 126.5350, "name": "哈尔滨"},
    {"lat": 43.8171, "lon": 125.3235, "name": "长春"},
    {"lat": 41.8057, "lon": 123.4315, "name": "沈阳"},
    {"lat": 38.9140, "lon": 121.6147, "name": "大连"},
    # 华南
    {"lat": 22.8170, "lon": 108.3669, "name": "南宁"},
    {"lat": 20.0174, "lon": 110.3493, "name": "海口"},
    {"lat": 23.1353, "lon": 106.6354, "name": "贵阳"},
]


def find_city_by_name(city_name: str) -> Optional[dict]:
    """根据城市名模糊匹配坐标库。"""
    for c in CITY_COORDS:
        if c["name"] in city_name or city_name in c["name"]:
            return c
    return None


def find_nearest_city(lat: float, lon: float) -> str:
    """根据经纬度匹配最近城市名（与前端逻辑一致）。"""
    nearest = "北京"
    min_dist = float("inf")
    for c in CITY_COORDS:
        d = (lat - c["lat"]) ** 2 + (lon - c["lon"]) ** 2
        if d < min_dist:
            min_dist = d
            nearest = c["name"]
    return nearest
