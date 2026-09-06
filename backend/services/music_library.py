"""曲库服务

曲库构成（合法方案）：
1. 内置演示曲目：SoundHelix 官方免费演示音源，作者明确允许用于测试/演示。
2. 本地音乐目录：扫描 backend/music/ 下的音频文件（用户自行放入的
   合法拥有的音乐），文件名支持「歌手 - 歌名.扩展名」格式自动解析。

注意：不内置任何商业版权歌曲。用户想扩充曲库，请将自己拥有合法使用权的
音频文件放入 backend/music/ 目录，重启或调用刷新接口即可自动入库。
"""
import hashlib
from pathlib import Path

from config import BASE_DIR

# 本地音乐目录（不存在则自动创建）
MUSIC_DIR = BASE_DIR / "music"
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

# 支持的音频扩展名 → MIME 类型
AUDIO_MEDIA_TYPES = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
}

# 内置免费演示曲目（SoundHelix 免费音源，可商用演示）
DEMO_TRACKS = [
    {"idx": 1,  "genre": "电子"},
    {"idx": 2,  "genre": "流行"},
    {"idx": 3,  "genre": "轻音乐"},
    {"idx": 4,  "genre": "摇滚"},
    {"idx": 5,  "genre": "爵士"},
    {"idx": 6,  "genre": "民谣"},
    {"idx": 7,  "genre": "电子"},
    {"idx": 8,  "genre": "流行"},
    {"idx": 9,  "genre": "轻音乐"},
    {"idx": 10, "genre": "摇滚"},
    {"idx": 11, "genre": "爵士"},
    {"idx": 12, "genre": "古典"},
]


def build_demo_tracks() -> list[dict]:
    """构造内置演示曲目列表。"""
    tracks = []
    for item in DEMO_TRACKS:
        idx = item["idx"]
        tracks.append({
            "id": f"demo-{idx:02d}",
            "title": f"演示音轨 {idx:02d}",
            "artist": "SoundHelix（免费演示音源）",
            "album": "内置演示曲库",
            "genre": item["genre"],
            "source": "demo",
            "url": f"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-{idx}.mp3",
        })
    return tracks


def _parse_filename(stem: str) -> tuple[str, str]:
    """从文件名解析歌手与歌名。

    约定「歌手 - 歌名」格式；无分隔符时整体作为歌名。
    """
    if " - " in stem:
        artist, _, title = stem.partition(" - ")
        artist, title = artist.strip(), title.strip()
        if artist and title:
            return artist, title
    return "", stem.strip()


def local_track_id(path: Path) -> str:
    """根据文件名生成稳定的曲目 id。"""
    return "local-" + hashlib.md5(path.name.encode("utf-8")).hexdigest()[:12]


def scan_local_tracks(base_url: str) -> list[dict]:
    """扫描本地音乐目录，返回曲目元数据列表。"""
    tracks = []
    if not MUSIC_DIR.exists():
        return tracks
    base_url = base_url.rstrip("/")
    for path in sorted(MUSIC_DIR.iterdir()):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in AUDIO_MEDIA_TYPES:
            continue
        artist, title = _parse_filename(path.stem)
        tid = local_track_id(path)
        tracks.append({
            "id": tid,
            "title": title or path.stem,
            "artist": artist or "本地音乐",
            "album": "本地曲库",
            "genre": "本地",
            "source": "local",
            "url": f"{base_url}/api/v1/music/stream/{tid}",
        })
    return tracks


def get_library(base_url: str) -> list[dict]:
    """返回完整曲库：本地音乐 + 内置演示曲目。

    本地已合成演示曲目（generate_demo_tracks.py）时，不再叠加加载缓慢的
    在线 SoundHelix 演示，避免国内网络下长时间缓冲“没声音”。
    """
    local = scan_local_tracks(base_url)
    has_local_demo = any(t["title"].startswith("演示音轨") for t in local)
    if has_local_demo:
        return local
    return local + build_demo_tracks()


def resolve_local_file(track_id: str) -> Path | None:
    """根据曲目 id 反查本地音频文件（校验合法性，防止路径穿越）。"""
    if not MUSIC_DIR.exists():
        return None
    for path in MUSIC_DIR.iterdir():
        if path.is_file() and path.suffix.lower() in AUDIO_MEDIA_TYPES:
            if local_track_id(path) == track_id:
                return path
    return None


def media_type_of(path: Path) -> str:
    """返回音频文件对应的 MIME 类型。"""
    return AUDIO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
