# 智能座舱助手 (Smart Cabin Assistant)

多模态智能座舱交互终端 —— 疲劳检测、表情识别、语音对话、车辆仪表一体化系统。

## 功能模块

| 模块 | 说明 |
|------|------|
| 🚗 仪表盘 | 实时车速/转速/油量/胎压/水温，WebSocket 推送 |
| 😴 疲劳检测 | MediaPipe 468 关键点 → EAR/MAR，事件驱动告警（哈欠→轻度，闭眼→中/重度）+ 分层参考评分 |
| 😊 表情识别 | ONNX EfficientNet-B2 7 类情绪分类 + MediaPipe 规则引擎双引擎 |
| 🎤 语音助手 | 唤醒词"小龙" + 浏览器原生 ASR + DeepSeek AI 对话 |
| 🌤 天气 | Open-Meteo 免费 API，高德 IP 定位 + 手动选城（localStorage 记忆），支持全国 30+ 城市 |
| 🛡 安全驾驶 | 分心检测、哈欠计数、视线偏离、疲劳事件记录 |

## 环境要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Python | 3.10+ | 后端 + 摄像头服务 |
| Node.js | 18+ | 前端构建 |
| 摄像头 | USB/内置 | 疲劳/表情检测必需 |

## 快速开始

### Windows

```bash
# 1. 克隆仓库
git clone https://github.com/1015-jbz/smart_seat.git
cd smart_seat

# 2. 安装后端依赖
cd backend
python -m venv venv
source venv/Scripts/activate   # Git Bash
# 或: venv\Scripts\activate    # CMD / PowerShell
pip install -r requirements.txt

# 3. 配置 API Key
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 4. 安装前端依赖
cd ..
npm install

# 5. 配置环境变量（可选）
cp .env.example .env.local
# 如需部署到其他地址，编辑 .env.local 修改 VITE_API_BASE

# 6. 启动全部服务
# 终端 1: 后端
cd backend && source venv/Scripts/activate && python main.py

# 终端 2: 摄像头
cd backend && source venv/Scripts/activate && python camera_server.py

# 终端 3: 前端
npm run dev

# 浏览器打开 http://localhost:5173
```

### 龙芯平台 (LoongArch)

```bash
# 1. 克隆仓库
git clone https://github.com/1015-jbz/smart_seat.git
cd smart_seat

# 2. 一键安装（自动适配 loongarch64，跳过无预编译包的组件）
chmod +x setup.sh
./setup.sh

# 3. 配置 API Key（setup.sh 会自动生成模板）
vim backend/.env

# 4. 一键启动
chmod +x start.sh
./start.sh
```

> **龙芯注意**：`onnxruntime` 和 `mediapipe` 在 LoongArch 上无预编译 whl，会自动降级到 OpenCV Haar Cascade 人脸检测。功能完整可用，仅表情分类精度略降。

## 项目结构

```
smart_seat/
├── backend/
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 配置中心
│   ├── camera_server.py     # Flask 摄像头 + 表情/疲劳检测
│   ├── database.py           # SQLite ORM
│   ├── schemas.py            # Pydantic 模型
│   ├── requirements.txt      # Python 依赖
│   ├── .env                  # API Key（不入库）
│   ├── routers/              # API 路由
│   │   ├── chat.py           #   POST /chat（DeepSeek AI）
│   │   ├── location.py       #   GET  /location（IP 定位代理）
│   │   ├── weather.py        #   GET  /weather（Open-Meteo）
│   │   ├── vehicle.py        #   WebSocket + REST 车辆数据
│   │   ├── safety.py         #   疲劳事件记录/统计
│   │   ├── emotion.py        #   表情记录/统计
│   │   └── driving.py        #   驾驶会话管理
│   └── services/             # 业务逻辑
│       ├── chat_agent.py     #   DeepSeek API 封装
│       ├── location_proxy.py #   IP 定位多级 fallback
│       ├── weather_proxy.py  #   天气 API + 城市坐标库
│       ├── fatigue.py        #   疲劳评分算法
│       └── hardware_sim.py   #   车辆硬件模拟器
├── src/
│   ├── pages/                # 页面组件
│   │   ├── VehicleDashboard.jsx  # 仪表盘
│   │   ├── DrivingSafety.jsx     # 疲劳 + 安全检测
│   │   ├── EmotionRecognition.jsx# 表情识别
│   │   ├── VoiceAssistant.jsx    # 语音助手
│   │   └── Weather.jsx           # 天气
│   ├── context/
│   │   └── VehicleStore.jsx      # 全局状态
│   ├── services/
│   │   ├── api.js                # 后端 API 客户端
│   │   └── weatherApi.js         # 天气直连 fallback
│   └── components/               # 通用组件
├── setup.sh                 # 龙芯平台安装脚本
├── start.sh                 # 龙芯平台启动脚本
├── .env.example             # 前端环境变量模板
└── package.json
```

## 环境变量

### 前端 `.env.local`

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE` | `http://localhost:8000` | 后端 API 地址 |
| `VITE_CAMERA_BASE` | `http://localhost:7861` | 摄像头服务地址 |
| `VITE_APP_TITLE` | `智能座舱车载助手` | 页面标题 |
| `VITE_DEFAULT_USERNAME` | `车主` | 默认用户名 |

### 后端 `backend/.env`

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | DeepSeek AI API 密钥（从 platform.deepseek.com 获取） |
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `PORT` | 监听端口，默认 `8000` |

## 服务端口

| 服务 | 端口 | 技术栈 |
|------|------|--------|
| 前端 (Vite) | 5173 | React 19 + TailwindCSS 4 |
| 后端 (FastAPI) | 8000 | FastAPI + SQLAlchemy + SQLite |
| 摄像头 (Flask) | 7861 | Flask + OpenCV + MediaPipe + ONNX |

## 架构说明

```
浏览器 (React)
    │
    ├── :8000/api/v1/* ──→ FastAPI 后端 ──→ SQLite
    │                           │
    │                           ├── DeepSeek API（AI 对话）
    │                           ├── Open-Meteo（天气）
    │                           └── 高德 / pconline / ipinfo（IP 定位）
    │
    ├── :7861/video_feed ──→ Flask 摄像头 ──→ USB 摄像头
    │       /api/state              │
    │                           ├── MediaPipe 468 关键点
    │                           ├── ONNX EfficientNet-B2
    │                           └── Haar Cascade (fallback)
    │
    └── ws://:8000/ws/vehicle ──→ WebSocket 车辆数据推送
```
