@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   智能座舱 - 挑战杯项目 一键环境安装
echo ========================================
echo.

:: 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    echo 下载: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo [√] Python 已安装

:: 检查 Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未找到 Node.js，前端将无法启动
    echo 下载: https://nodejs.org/
)

:: 创建虚拟环境
if not exist "backend\.venv" (
    echo [*] 创建 Python 虚拟环境...
    cd backend
    python -m venv .venv
    cd ..
)
echo [√] Python 虚拟环境已就绪

:: 激活虚拟环境并安装依赖
echo.
echo [*] 安装 Python 依赖...
cd backend
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip -q
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [错误] Python 依赖安装失败
    pause
    exit /b 1
)
echo [√] Python 依赖已安装
cd ..

:: 安装前端依赖
echo.
echo [*] 安装前端依赖...
call npm install
if %errorlevel% neq 0 (
    echo [警告] 前端依赖安装失败，请检查 Node.js 和网络
) else (
    echo [√] 前端依赖已安装
)

:: 下载 ONNX 表情模型
echo.
if not exist "backend\models\enet_b2_7.onnx" (
    echo [!] ONNX 表情模型未找到
    echo    请从 smart_cockpit 项目复制 models\enet_b2_7.onnx 到 backend\models\
) else (
    echo [√] ONNX 表情识别模型已就绪
)

:: 下载 MediaPipe 模型
if not exist "backend\models\face_landmarker.task" (
    echo [*] 下载 MediaPipe FaceLandmarker 模型...
    python -c "import urllib.request; urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', 'backend/models/face_landmarker.task')"
    if exist "backend\models\face_landmarker.task" (
        echo [√] MediaPipe 模型下载完成
    ) else (
        echo [警告] MediaPipe 模型下载失败
    )
) else (
    echo [√] MediaPipe FaceLandmarker 模型已就绪
)

echo.
echo ========================================
echo   安装完成！
echo.
echo   下一步: 双击 start.bat 启动项目
echo ========================================
echo.
pause
