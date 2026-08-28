"""音乐娱乐 API 路由

- GET  /music/library          完整曲库（本地音乐 + 内置演示曲目）
- GET  /music/search?q=        按歌名/歌手/风格搜索
- GET  /music/stream/{id}      流式播放本地音频文件（支持拖动进度条）
- POST /music/refresh          重新扫描本地音乐目录
- GET  /music/online/search?q= 在线曲库搜索（Jamendo，数十万首 CC 授权曲目）
- GET  /music/online/hot       在线曲库热门榜（可按风格筛选）
"""
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from services.music_library import (
    MUSIC_DIR,
    get_library,
    media_type_of,
    resolve_local_file,
)
from services.music_online import jamendo_hot, search_jamendo

router = APIRouter(prefix="/music", tags=["音乐娱乐"])


@router.get("/library", response_model=None)
async def music_library(request: Request):
    """返回完整曲库列表。"""
    try:
        base_url = str(request.base_url)
        tracks = get_library(base_url)
        return {
            "total": len(tracks),
            "tracks": tracks,
            "local_dir": str(MUSIC_DIR),
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/search", response_model=None)
async def music_search(request: Request, q: str = Query("", description="歌名/歌手/风格关键词")):
    """按关键词搜索曲库（匹配歌名、歌手、风格）。"""
    try:
        base_url = str(request.base_url)
        tracks = get_library(base_url)
        keyword = q.strip().lower()
        if not keyword:
            return {"total": len(tracks), "tracks": tracks}
        matched = [
            t for t in tracks
            if keyword in t["title"].lower()
            or keyword in t["artist"].lower()
            or keyword in t["genre"].lower()
        ]
        return {"total": len(matched), "tracks": matched}
    except Exception as e:
        return {"error": str(e)}


@router.get("/stream/{track_id}")
async def stream_track(track_id: str):
    """流式播放本地音频文件。"""
    path = resolve_local_file(track_id)
    if path is None:
        raise HTTPException(status_code=404, detail="曲目不存在或已被移除")
    return FileResponse(
        path,
        media_type=media_type_of(path),
        filename=path.name,
    )


@router.post("/refresh", response_model=None)
async def refresh_library(request: Request):
    """重新扫描本地音乐目录（放入新文件后无需重启后端）。"""
    try:
        base_url = str(request.base_url)
        tracks = get_library(base_url)
        return {"total": len(tracks), "tracks": tracks, "message": "曲库已刷新"}
    except Exception as e:
        return {"error": str(e)}


@router.get("/online/search", response_model=None)
async def online_search(q: str = Query(..., description="歌名/歌手/风格关键词"), limit: int = Query(30, le=100)):
    """在线曲库搜索（Jamendo CC 授权曲目，返回可直接播放的流媒体链接）。"""
    try:
        tracks, err = await search_jamendo(q.strip(), limit=limit)
        if err:
            return {"error": err}
        return {"total": len(tracks), "tracks": tracks}
    except Exception as e:
        return {"error": f"在线曲库请求失败: {e}"}


@router.get("/online/hot", response_model=None)
async def online_hot(tag: str = Query("", description="中文风格词，如：流行/摇滚/电子"), limit: int = Query(30, le=100)):
    """在线曲库热门榜（可按风格筛选）。"""
    try:
        tracks, err = await jamendo_hot(tag.strip(), limit=limit)
        if err:
            return {"error": err}
        return {"total": len(tracks), "tracks": tracks}
    except Exception as e:
        return {"error": f"在线曲库请求失败: {e}"}
