"""定位代理 API 路由

- GET /location         IP 定位（高德优先，pconline 兜底）
- POST /location/regeo  逆地理编码（GPS经纬度 → 中文地址，街道级）
- GET /location/cities  返回支持的城市列表（手动选择兜底）
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.location_proxy import locate_by_ip, regeo_by_amap, search_city_by_amap
from services.weather_proxy import CITY_COORDS

router = APIRouter(prefix="/location", tags=["定位代理"])


class RegeoRequest(BaseModel):
    latitude: float
    longitude: float


@router.get("", response_model=None)
async def get_location():
    """IP 定位，返回城市名和经纬度。

    返回字段：
    - city: 城市名
    - district: 区县（高德IP定位才有）
    - province: 省份
    - latitude, longitude: 经纬度
    - source: 定位来源 (amap_ip / ip / default)
    """
    try:
        result = await locate_by_ip()
        if result is None:
            default = CITY_COORDS[0]
            return {
                "city": default["name"],
                "district": None,
                "province": "北京",
                "latitude": default["lat"],
                "longitude": default["lon"],
                "source": "default",
                "error": "IP 定位失败，已返回默认城市（北京）",
            }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regeo", response_model=None)
async def regeo_location(req: RegeoRequest):
    """逆地理编码：经纬度 → 中文地址（街道级精度）。

    需要配置 AMAP_KEY（高德key）。
    请求体: { latitude, longitude }
    返回: { city, district, province, address, latitude, longitude, source: "gps" }
    """
    try:
        result = await regeo_by_amap(req.latitude, req.longitude)
        if result is None:
            # 高德不可用时，用本地城市库找最近城市
            nearest = None
            min_dist = float("inf")
            for c in CITY_COORDS:
                d = ((c["lat"] - req.latitude) ** 2 + (c["lon"] - req.longitude) ** 2) ** 0.5
                if d < min_dist:
                    min_dist = d
                    nearest = c
            if nearest:
                return {
                    "city": nearest["name"],
                    "district": None,
                    "province": None,
                    "address": None,
                    "latitude": req.latitude,
                    "longitude": req.longitude,
                    "source": "gps_approx",
                    "warning": "高德逆地理不可用，已近似匹配最近城市",
                }
            raise HTTPException(status_code=400, detail="逆地理编码失败")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cities", response_model=None)
async def list_supported_cities():
    """返回城市坐标库（前端可手动选择兜底）。"""
    try:
        return {
            "cities": [
                {"name": c["name"], "lat": c["lat"], "lon": c["lon"]}
                for c in CITY_COORDS
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search", response_model=None)
async def search_city(city: str):
    """城市搜索：支持搜索任意城市/区县/街道。

    使用高德地理编码 API，返回多个匹配结果。
    返回: { results: [{city, district, province, address, latitude, longitude}, ...] }
    """
    if not city or len(city.strip()) < 2:
        return {"results": [], "error": "请输入至少 2 个字符"}
    try:
        results = await search_city_by_amap(city.strip())
        if results is None:
            return {"results": [], "error": "搜索失败，请稍后重试"}
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
