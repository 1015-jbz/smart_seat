"""在线曲库代理（合法免费音源）

数据源：Jamendo —— 全球独立音乐人平台，数十万首以知识共享（CC）
授权发布的曲目，官方提供免费搜索与流媒体播放 API。

- 需要在 backend/.env 配置 JAMENDO_CLIENT_ID（免费注册：
  https://devportal.jamendo.com ，创建应用即可获得）
- 未接入任何商业平台（网易云/QQ音乐等）的抓取接口
"""
import httpx

from config import API_TIMEOUT, JAMENDO_API_URL, JAMENDO_CLIENT_ID

# 中文风格词 → Jamendo 英文标签（风格筛选用）
GENRE_TAG_MAP = {
    "流行": "pop",
    "摇滚": "rock",
    "电子": "electronic",
    "爵士": "jazz",
    "古典": "classical",
    "轻音乐": "ambient",
    "民谣": "folk",
    "金属": "metal",
    "嘻哈": "hiphop",
    "氛围": "chillout",
}


def client_ready() -> bool:
    """Jamendo client_id 是否已配置。"""
    return bool(JAMENDO_CLIENT_ID)


def _map_track(raw: dict, genre: str) -> dict:
    """把 Jamendo 曲目转为前端统一结构。"""
    return {
        "id": f"jamendo-{raw.get('id')}",
        "title": raw.get("name") or "",
        "artist": raw.get("artist_name") or "",
        "album": raw.get("album_name") or "",
        "genre": genre,
        "source": "jamendo",
        "url": raw.get("audio") or "",
        "cover": raw.get("album_image") or "",
        "duration": raw.get("duration") or 0,
    }


async def _fetch_tracks(params: dict, genre: str) -> tuple[list | None, str | None]:
    """调用 Jamendo /tracks 接口。返回 (曲目列表, 错误信息)。"""
    if not client_ready():
        return None, "在线曲库未启用：请在 backend/.env 配置 JAMENDO_CLIENT_ID（免费注册 devportal.jamendo.com 获取）"
    query = {
        "client_id": JAMENDO_CLIENT_ID,
        "format": "json",
        "audioformat": "mp32",
        "imagesize": 300,
        "type": "single albumtrack",
        **params,
    }
    async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
        resp = await client.get(f"{JAMENDO_API_URL}/tracks/", params=query)
        resp.raise_for_status()
        data = resp.json()
    if data.get("headers", {}).get("status") != "success":
        return None, data.get("headers", {}).get("error_message") or "Jamendo 接口返回异常"
    results = data.get("results") or []
    tracks = [_map_track(t, genre) for t in results if t.get("audio")]
    return tracks, None


async def search_jamendo(q: str, limit: int = 30) -> tuple[list | None, str | None]:
    """在线搜索曲库（歌名/歌手/标签自由文本搜索）。"""
    return await _fetch_tracks(
        {"search": q, "limit": limit, "boost": "popularity_month"},
        genre="在线",
    )


async def jamendo_hot(tag_cn: str = "", limit: int = 30) -> tuple[list | None, str | None]:
    """按风格获取热门曲目；不传风格则返回综合热门榜。"""
    genre = tag_cn or "在线"
    tag = GENRE_TAG_MAP.get(tag_cn, "")
    params = {"limit": limit, "groupby": "artist_id"}
    if tag:
        params["fuzzytags"] = tag
        params["order"] = "popularity_month"
    else:
        params["order"] = "popularity_month"
    return await _fetch_tracks(params, genre=genre)
