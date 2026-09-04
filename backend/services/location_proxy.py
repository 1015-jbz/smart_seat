"""IP 定位代理服务（多源降级，国内优先高德）

定位精度排序（从高到低）：
  1. 浏览器 GPS + 高德逆地理编码  → 街道级（最准，需用户授权）
  2. 高德 IP 定位                   → 区县级（推荐，免费 30万次/日）
  3. 太平洋电脑网 IP 定位           → 市级（免费兜底，无需 key）
  4. 本地 46 城市库                 → 离线兜底

返回格式：
  { city, district, latitude, longitude, province, address, source }
  - district: 区县（高德才有，pconline 为 None）
  - address:  完整地址描述（GPS 逆地理才有）
  - source:   "gps" / "amap_ip" / "ip" / "default"
"""
import json
import re
from typing import Optional

import httpx

from config import (
    AMAP_IP_URL,
    AMAP_KEY,
    AMAP_REGEO_URL,
    AMAP_GEO_URL,
    PCONLINE_IP_URL,
    API_TIMEOUT,
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
    """去掉城市/省份名末尾的"市""区""省""县""盟""州"等后缀。"""
    if not name:
        return ""
    return re.sub(r"[市省县区盟州县旗]$", "", name)


def _match_local(city_name: str, pro_name: str = "") -> Optional[dict]:
    """在本地 CITY_COORDS 里模糊匹配城市，返回 {name, lat, lon}。"""
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


# ============================================================
# 高德地图 API（国内最准，推荐主源）
# ============================================================

async def _locate_via_amap_ip() -> Optional[dict]:
    """高德 IP 定位 → 精确到区县级。

    免费额度：30万次/日，需在高德开放平台申请 key。
    返回: {city, district, latitude, longitude, province, source: "amap_ip"}
    """
    if not AMAP_KEY:
        return None  # 未配置 key，跳过

    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(AMAP_IP_URL, params={"key": AMAP_KEY})
            data = resp.json()

        if data.get("status") != "1":
            # 高德返回 status=0 表示失败（如 key 无效、配额耗尽）
            print(f"[location_proxy] 高德IP定位失败: {data.get('info')}")
            return None

        province = data.get("province") or ""
        city = data.get("city") or ""
        rectangle = data.get("rectangle") or ""  # 城市范围 "lng1,lat1;lng2,lat2"

        # 从 rectangle 提取中心点经纬度
        lat = lon = None
        if rectangle and ";" in rectangle:
            try:
                pt1, pt2 = rectangle.split(";", 1)
                lng1, lat1 = map(float, pt1.split(","))
                lng2, lat2 = map(float, pt2.split(","))
                lon = round((lng1 + lng2) / 2, 4)
                lat = round((lat1 + lat2) / 2, 4)
            except Exception:
                pass

        # 经纬度为空 → 用本地城市库补全
        if lat is None or lon is None:
            found = _match_local(city, province)
            if found:
                lat = found["lat"]
                lon = found["lon"]

        if lat is None or lon is None:
            return None

        city_clean = _strip_suffix(city) or city
        prov_clean = _strip_suffix(province) or province

        return {
            "city": city_clean,
            "district": data.get("district") or None,  # 有些IP能到区县
            "latitude": lat,
            "longitude": lon,
            "province": prov_clean,
            "address": None,
            "source": "amap_ip",
        }
    except Exception as e:
        print(f"[location_proxy] 高德IP定位异常: {e}")
        return None


async def regeo_by_amap(latitude: float, longitude: float) -> Optional[dict]:
    """高德逆地理编码：经纬度 → 中文地址（街道级）。

    免费额度：30万次/日，需 AMAP_KEY。
    返回: {city, district, address, province, latitude, longitude, source: "gps"}
    """
    if not AMAP_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(AMAP_REGEO_URL, params={
                "key": AMAP_KEY,
                "location": f"{longitude},{latitude}",
                "extensions": "base",
                "radius": 1000,  # 1km 范围内
            })
            data = resp.json()

        if data.get("status") != "1":
            print(f"[location_proxy] 高德逆地理失败: {data.get('info')}")
            return None

        regeo = data.get("regeocode") or {}
        addr_component = regeo.get("addressComponent") or {}
        province = addr_component.get("province") or ""
        city = addr_component.get("city") or ""
        district = addr_component.get("district") or ""
        formatted = regeo.get("formatted_address") or ""

        # city 可能为空（直辖市），用 province 代替
        city_clean = _strip_suffix(city) or _strip_suffix(province) or ""
        prov_clean = _strip_suffix(province) or ""
        dist_clean = _strip_suffix(district) or ""

        return {
            "city": city_clean,
            "district": dist_clean,
            "province": prov_clean,
            "address": formatted,
            "latitude": latitude,
            "longitude": longitude,
            "source": "gps",
        }
    except Exception as e:
        print(f"[location_proxy] 高德逆地理异常: {e}")
        return None


# ============================================================
# 太平洋电脑网 IP 定位（免费兜底，市级精度）
# ============================================================

async def _locate_via_pconline() -> Optional[dict]:
    """太平洋电脑网 IP 定位 → 市级精度。

    完全免费、无需 key、国内稳定。作为高德不可用时的备用。
    """
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

        # 本地 CITY_COORDS 精确匹配 → 拿到坐标
        found = _match_local(city_raw, pro)
        if found:
            return {
                "city": found["name"],
                "district": None,
                "latitude": found["lat"],
                "longitude": found["lon"],
                "province": pro_clean,
                "address": None,
                "source": "ip",
            }

        # 本地库没有 → Open-Meteo geocoding 补坐标
        geo = await _geocode(city_name)
        if geo:
            return {
                "city": city_name,
                "district": None,
                "latitude": geo[0],
                "longitude": geo[1],
                "province": pro_clean,
                "address": None,
                "source": "ip",
            }

        return None
    except Exception as e:
        print(f"[location_proxy] pconline 定位失败: {e}")
        return None


async def _geocode(city_name: str) -> Optional[tuple]:
    """Open-Meteo Geocoding API 按城市名查经纬度（免费、无需 key）。"""
    if not city_name:
        return None
    try:
        from config import OPEN_METEO_GEOCODING_URL
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


async def search_city_by_amap(keyword: str) -> Optional[list]:
    """高德地理编码：城市名/地址 → 坐标列表。

    支持搜索任意城市/区县/街道，返回多个匹配结果。
    免费额度：30万次/日，需 AMAP_KEY。
    返回: [{city, district, province, address, latitude, longitude}, ...] 或 None
    """
    if not AMAP_KEY or not keyword:
        return None

    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            resp = await client.get(AMAP_GEO_URL, params={
                "key": AMAP_KEY,
                "address": keyword,
            })
            data = resp.json()

        if data.get("status") != "1":
            print(f"[location_proxy] 高德地理编码失败: {data.get('info')}")
            return None

        geocodes = data.get("geocodes") or []
        results = []
        for geo in geocodes[:8]:
            location = geo.get("location") or ""
            if not location or "," not in location:
                continue
            lon_str, lat_str = location.split(",", 1)
            try:
                lon = round(float(lon_str), 4)
                lat = round(float(lat_str), 4)
            except ValueError:
                continue

            province = geo.get("province") or ""
            city = geo.get("city") or ""
            district = geo.get("district") or ""
            formatted = geo.get("formatted_address") or ""

            city_clean = _strip_suffix(city) or _strip_suffix(province) or keyword
            prov_clean = _strip_suffix(province) or ""
            dist_clean = _strip_suffix(district) or ""

            results.append({
                "city": city_clean,
                "district": dist_clean or None,
                "province": prov_clean or None,
                "address": formatted,
                "latitude": lat,
                "longitude": lon,
            })

        return results if results else None
    except Exception as e:
        print(f"[location_proxy] 高德地理编码异常: {e}")
        return None


# ============================================================
# 主入口
# ============================================================

async def locate_by_ip() -> Optional[dict]:
    """IP 定位主入口：多源降级，优先用高德（区县精度）。"""
    # 方案 1: 高德 IP 定位（区县精度，推荐）
    if AMAP_KEY:
        result = await _locate_via_amap_ip()
        if result:
            return result

    # 方案 2: 太平洋电脑网（市级精度，免费兜底）
    result = await _locate_via_pconline()
    if result:
        return result

    return None
