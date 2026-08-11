"""IP 定位代理服务

流程：
  1. pconline IP 定位 → 拿到 city（中文城市名）+ pro（省份）
  2. 用 Open-Meteo Geocoding API 按城市名查真实经纬度（免费、无需 key）
  3. geocoding 失败 → fallback 本地 CITY_COORDS 模糊匹配
  4. 本地也匹配不到 → 用省份回退到省会（本地库）
  5. 全部失败 → fallback ipinfo.io（返回经纬度）
  6. 还失败 → 返回 None（routers 层给北京默认值）

返回：{ city, latitude, longitude, pro, source }
  保证 latitude/longitude 非 None。
"""
import json
import re
from typing import Optional

import httpx

from config import (
    PCONLINE_IP_URL,
    IPINFO_URL,
    API_TIMEOUT,
    OPEN_METEO_GEOCODING_URL,
)
from services.weather_proxy import CITY_COORDS, find_nearest_city


# 省 → 省会 映射（city 匹配不到时的兜底）
PROVINCE_CAPITALS = {
    "河北": "石家庄", "山西": "太原", "辽宁": "沈阳", "吉林": "长春",
    "黑龙江": "哈尔滨", "江苏": "南京", "浙江": "杭州", "安徽": "合肥",
    "福建": "福州", "江西": "南昌", "山东": "济南", "河南": "郑州",
    "湖北": "武汉", "湖南": "长沙", "广东": "广州", "海南": "海口",
    "四川": "成都", "贵州": "贵阳", "云南": "昆明", "陕西": "西安",
    "甘肃": "兰州", "青海": "西宁", "台湾": "台北",
    "内蒙古": "呼和浩特", "广西": "南宁", "西藏": "拉萨",
    "宁夏": "银川", "新疆": "乌鲁木齐",
    "北京": "北京", "上海": "上海", "天津": "天津", "重庆": "重庆",
}


def _strip_suffix(name: str) -> str:
    """去掉城市/省份名末尾的"市""区""省"等后缀。"""
    return re.sub(r"[市区省盟州县]$", "", name or "")


def _match_local(city_name: str, pro_name: str = "") -> Optional[dict]:
    """在本地 CITY_COORDS 里模糊匹配。"""
    stripped = _strip_suffix(city_name)
    if stripped:
        for c in CITY_COORDS:
            cname = _strip_suffix(c["name"])
            if cname == stripped or stripped in cname or cname in stripped:
                return c
    # 按省份回退到省会
    pro_clean = _strip_suffix(pro_name)
    if pro_clean and pro_clean in PROVINCE_CAPITALS:
        cap = PROVINCE_CAPITALS[pro_clean]
        for c in CITY_COORDS:
            if _strip_suffix(c["name"]) == _strip_suffix(cap):
                return c
    return None


async def _geocode(city_name: str) -> Optional[tuple]:
    """调用 Open-Meteo Geocoding API 按城市名查经纬度。

    返回 (lat, lon) 或 None。免费、无需 key、无调用限制。
    """
    if not city_name:
        return None
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(OPEN_METEO_GEOCODING_URL, params={
                "name": city_name,
                "count": 1,
                "language": "zh",
                "format": "json",
            })
            resp.raise_for_status()
            data = resp.json()
        results = data.get("results")
        if results and len(results) > 0:
            r = results[0]
            lat = r.get("latitude")
            lon = r.get("longitude")
            if lat is not None and lon is not None:
                return (float(lat), float(lon))
    except Exception as e:
        print(f"[location_proxy] geocoding 失败 ({city_name}): {e}")
    return None


async def locate_by_ip() -> Optional[dict]:
    """IP 定位主流程。"""
    # 方案 1: pconline（拿城市名）→ geocoding（查精确坐标）
    result = await _locate_via_pconline()
    if result:
        return result

    # 方案 2: ipinfo.io（直接返回经纬度）
    result = await _locate_via_ipinfo()
    if result:
        return result

    return None


async def _locate_via_pconline() -> Optional[dict]:
    """太平洋电脑网 IP 定位 → Open-Meteo geocoding 查坐标。"""
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(PCONLINE_IP_URL)
            raw = resp.content
        text = raw.decode("gb18030", errors="ignore")
        match = re.search(r"\{[^}]+\}", text)
        if not match:
            return None
        data = json.loads(match.group(0))
        city_raw = data.get("city") or ""
        pro = data.get("pro") or ""

        if not city_raw and not pro:
            return None

        city_name = _strip_suffix(city_raw) or _strip_suffix(pro) or "北京"
        pro_clean = _strip_suffix(pro) if pro else None

        # 1) 优先查本地 CITY_COORDS（坐标精确、不会查到同名异地）
        found = _match_local(city_raw, pro)
        if found:
            return {
                "city": found["name"],
                "latitude": found["lat"],
                "longitude": found["lon"],
                "pro": pro_clean,
                "source": "ip",
            }

        # 2) 本地库没有 → Open-Meteo geocoding 查坐标
        geo = await _geocode(city_name)
        if geo:
            return {
                "city": city_name,
                "latitude": geo[0],
                "longitude": geo[1],
                "pro": pro_clean,
                "source": "ip",
            }

        # 3) 都失败 → 北京保底
        fallback = CITY_COORDS[0]
        return {
            "city": "北京",
            "latitude": fallback["lat"],
            "longitude": fallback["lon"],
            "pro": pro_clean,
            "source": "default",
        }
    except Exception as e:
        print(f"[location_proxy] pconline 定位失败: {e}")
        return None


async def _locate_via_ipinfo() -> Optional[dict]:
    """ipinfo.io 定位 fallback（直接返回经纬度）。"""
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(IPINFO_URL)
            resp.raise_for_status()
            data = resp.json()
        loc = data.get("loc") or ""
        if not loc or "," not in loc:
            return None
        lat_str, lon_str = loc.split(",", 1)
        lat = float(lat_str)
        lon = float(lon_str)
        city_raw = data.get("city") or ""
        region = data.get("region") or ""

        # 也尝试用 geocoding 精确化城市名
        city_name = _strip_suffix(city_raw) if city_raw else find_nearest_city(lat, lon)
        if city_raw:
            geo = await _geocode(city_name)
            if geo:
                lat, lon = geo

        return {
            "city": city_name,
            "latitude": lat,
            "longitude": lon,
            "pro": region or None,
            "source": "ipinfo",
        }
    except Exception as e:
        print(f"[location_proxy] ipinfo 定位失败: {e}")
        return None
