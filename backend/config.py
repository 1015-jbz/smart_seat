"""后端配置文件

集中管理数据库路径、CORS 来源、第三方 API 超时等配置项。
"""
import os
from pathlib import Path

# 项目根目录（backend/）
BASE_DIR = Path(__file__).resolve().parent

# 数据库文件路径：backend/data/smart_cabin.db
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "smart_cabin.db"

# SQLite 连接字符串
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# CORS 允许的前端来源
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# 第三方 API 请求超时（秒）
API_TIMEOUT = 10.0

# 天气缓存 TTL（秒）：10 分钟
WEATHER_CACHE_TTL = 600

# Open-Meteo 接口
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
# Open-Meteo Geocoding：按城市名查经纬度（免费、无需 key）
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

# IP 定位接口
PCONLINE_IP_URL = "https://whois.pconline.com.cn/ipJson.jsp?json=true"
IPINFO_URL = "https://ipinfo.io/json"

# WebSocket 推送间隔（秒）
WS_PUSH_INTERVAL = 1.0

# API 路由前缀
API_V1_PREFIX = "/api/v1"

# 默认服务器主机/端口
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
