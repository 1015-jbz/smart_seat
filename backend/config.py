"""后端配置文件

集中管理数据库路径、CORS 来源、第三方 API 超时等配置项。
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()  # 加载 backend/.env 中的环境变量

# 项目根目录（backend/）
BASE_DIR = Path(__file__).resolve().parent

# 数据库文件路径：backend/data/smart_cabin.db
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "smart_cabin.db"

# SQLite 连接字符串
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

# CORS 允许的前端来源（开发阶段用正则匹配所有本地端口）
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]
CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

# 第三方 API 请求超时（秒）
API_TIMEOUT = 10.0

# 天气缓存 TTL（秒）：10 分钟
WEATHER_CACHE_TTL = 600

# Open-Meteo 接口
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
# Open-Meteo Geocoding：按城市名查经纬度（免费、无需 key）
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

# IP 定位接口
# 高德地图 IP 定位（国内最准，精确到区县，免费 30万次/日，需申请 key）
AMAP_IP_URL = "https://restapi.amap.com/v3/ip"
AMAP_KEY = os.getenv("AMAP_KEY", "")
# 高德逆地理编码（经纬度 → 中文地址，免费 30万次/日）
AMAP_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
# 高德地理编码（城市名 → 经纬度，免费 30万次/日）
AMAP_GEO_URL = "https://restapi.amap.com/v3/geocode/geo"
# 备用：太平洋电脑网 IP 定位（免费、无需 key、市级精度）
PCONLINE_IP_URL = "https://whois.pconline.com.cn/ipJson.jsp?json=true"
# 已废弃：ipinfo.io 国内严重不准，不再使用

# WebSocket 推送间隔（秒）
WS_PUSH_INTERVAL = 1.0

# API 路由前缀
API_V1_PREFIX = "/api/v1"

# 默认服务器主机/端口
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# DeepSeek AI 对话 API
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_CHAT_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
