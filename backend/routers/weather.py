"""天气代理 API 路由

- GET /weather?lat=&lon=           代理 Open-Meteo API，返回实时天气+7天预报
- GET /weather/city/{city_name}    先通过城市名查坐标，再查天气
- 内存缓存 10 分钟
"""
from fastapi import APIRouter, Query

from services.weather_proxy import fetch_weather, find_city_by_name, CITY_COORDS

router = APIRouter(prefix="/weather", tags=["天气代理"])


@router.get("", response_model=None)
async def get_weather(
    lat: float = Query(..., description="纬度"),
    lon: float = Query(..., description="经度"),
):
    """代理 Open-Meteo API（解决跨域），返回实时天气 + 7 天预报。"""
    try:
        data = await fetch_weather(lat, lon)
        if data is None:
            return {"error": "获取天气数据失败，请稍后重试"}
        return data
    except Exception as e:
        return {"error": str(e)}


@router.get("/city/{city_name}", response_model=None)
async def get_weather_by_city(city_name: str):
    """先通过城市名查坐标（内置城市库），再查天气。"""
    try:
        city = find_city_by_name(city_name)
        if not city:
            return {"error": f"未找到城市: {city_name}", "available_cities": [c["name"] for c in CITY_COORDS]}
        data = await fetch_weather(city["lat"], city["lon"])
        if data is None:
            return {"error": "获取天气数据失败，请稍后重试"}
        # 附带城市信息
        return {"city": city["name"], **data}
    except Exception as e:
        return {"error": str(e)}


@router.get("/cities", response_model=None)
async def list_cities():
    """返回内置城市列表（供前端选择）。"""
    try:
        return {"cities": [{"name": c["name"], "lat": c["lat"], "lon": c["lon"]} for c in CITY_COORDS]}
    except Exception as e:
        return {"error": str(e)}
