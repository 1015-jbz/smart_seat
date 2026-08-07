"""定位代理 API 路由

- GET /location  代理太平洋电脑网 IP 定位（解决跨域），返回 {city, latitude, longitude, pro}
- 备用：ipinfo.io fallback
"""
from fastapi import APIRouter

from services.location_proxy import locate_by_ip
from services.weather_proxy import CITY_COORDS

router = APIRouter(prefix="/location", tags=["定位代理"])


@router.get("", response_model=None)
async def get_location():
    """代理 IP 定位，返回中文城市名和经纬度。"""
    try:
        result = await locate_by_ip()
        if result is None:
            # 所有方案都失败，返回默认城市
            default = CITY_COORDS[0]
            return {
                "city": default["name"],
                "latitude": default["lat"],
                "longitude": default["lon"],
                "pro": None,
                "source": "default",
                "error": "IP 定位失败，已返回默认城市（北京）",
            }
        return result
    except Exception as e:
        return {"error": str(e)}


@router.get("/cities", response_model=None)
async def list_supported_cities():
    """返回 IP 定位支持匹配的城市坐标库（前端可手动选择兜底）。"""
    try:
        return {
            "cities": [
                {"name": c["name"], "lat": c["lat"], "lon": c["lon"]}
                for c in CITY_COORDS
            ]
        }
    except Exception as e:
        return {"error": str(e)}
