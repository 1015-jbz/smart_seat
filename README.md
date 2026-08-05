# 智能座舱车载助手

基于 React + Vite 的智能座舱车载助手前端应用，支持车辆仪表盘、安全监控、语音助手、表情识别、天气信息、座舱控制等功能模块。

## 技术栈

- **框架**: React 19
- **构建工具**: Vite 8
- **样式**: TailwindCSS 4
- **路由**: React Router 7
- **图标**: Lucide React
- **代码检查**: Oxlint

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/Au1008333/tiaozhanbei.git
cd tiaozhanbei

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

启动后在浏览器打开 **http://localhost:5173** 即可访问。

### 其他命令

```bash
npm run build    # 生产构建
npm run preview  # 预览构建结果
npm run lint     # 代码检查
```

## 功能模块

| 模块 | 路由 | 说明 |
|------|------|------|
| 总览仪表盘 | `/` | 车辆状态总览、时钟、模块入口 |
| 车辆仪表 | `/vehicle` | 车速、转速、油量、水温等实时数据 |
| 安全监控 | `/safety` | 摄像头监控、疲劳检测、多维度安全数据 |
| 语音助手 | `/voice` | 语音对话、唤醒词"小龙"、智能回复 |
| 表情识别 | `/emotion` | 摄像头表情识别 |
| 天气信息 | `/weather` | 实时天气展示 |
| 座舱控制 | `/cabin` | 车内环境控制 |

## 项目结构

```
src/
├── components/       # 公共组件
│   ├── Layout.jsx    # 页面布局框架
│   ├── GaugeChart.jsx
│   ├── ProgressBar.jsx
│   ├── Sidebar.jsx
│   └── StatCard.jsx
├── context/          # 全局状态
│   ├── ThemeContext.jsx   # 主题/字体切换
│   └── VehicleStore.jsx   # 车辆共享数据
├── data/
│   └── mockData.js   # 模拟数据
├── pages/            # 页面组件
│   ├── Dashboard.jsx
│   ├── VehicleDashboard.jsx
│   ├── DrivingSafety.jsx
│   ├── VoiceAssistant.jsx
│   ├── EmotionRecognition.jsx
│   ├── Weather.jsx
│   └── CabinControl.jsx
├── App.jsx           # 路由配置
├── main.jsx          # 入口文件
└── index.css         # 全局样式
```

## 注意事项

- 语音助手和表情识别的摄像头/麦克风功能需要在 **localhost** 环境下使用
- 浏览器需要授权麦克风和摄像头权限
- 语音识别功能需要 Chrome 或 Edge 浏览器支持
