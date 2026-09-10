@echo off
cd /d "%~dp0"

REM === 检测 Python 路径 ===
REM 优先使用项目根目录虚拟环境，其次 backend\.venv，最后系统 Python
set "PY=%~dp0.venv\Scripts\python.exe"
if exist "%PY%" goto :py_found

set "PY=%~dp0backend\.venv\Scripts\python.exe"
if exist "%PY%" goto :py_found

where python >nul 2>nul
if errorlevel 1 goto :py_missing
for /f "delims=" %%i in ('where python') do (
    set "PY=%%i"
    goto :py_found
)

:py_missing
echo [ERROR] Python not found! Please install Python 3.10+ or run setup.bat
pause
exit /b 1

:py_found
echo [INFO] Using Python: %PY%

REM === 关闭本项目的旧服务进程（按脚本路径匹配），避免重复启动 ===
echo [*] 关闭旧的 smart_seat 服务进程（如有）...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*smart_seat*' }; $ids = @($p.ProcessId); $c = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $ids -contains $_.ParentProcessId }; @($ids + @($c.ProcessId)) | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul

echo === Smart Cockpit - Starting... ===

echo [1/4] Camera + Emotion Server :7861
start "Camera-Server" "%PY%" "%~dp0backend\camera_server.py" --port 7861

echo [2/4] Backend API :8000
start "Backend-API" "%PY%" "%~dp0backend\main.py"

echo [3/4] TTS Voice Server :7862
REM 语音合成服务：8 种音色角色 + 情绪切音 + 语速/音高/音量微调
REM 挂掉时前端会自动降级到浏览器内置语音，不影响其他功能
start "TTS-Server" "%PY%" "%~dp0backend\tts_server.py" --port 7862

echo [4/4] Frontend :5173
if not exist "%~dp0dist\index.html" (
    echo [INFO] dist 不存在，先自动构建前端...
    call npm run build
)
if exist "%~dp0dist\index.html" (
    echo [INFO] Serving pre-built dist folder...
    start "Frontend" "%PY%" "%~dp0backend\static_server.py" 5173 "%~dp0dist"
) else (
    echo [ERROR] dist/index.html not found! Run: npm run build
    start "Frontend" "%PY%" "%~dp0backend\static_server.py" 5173 "%~dp0"
)

echo.
echo === All services starting ===
echo Frontend : http://localhost:5173
echo Camera   : http://localhost:7861/video_feed
echo API docs : http://localhost:8000/docs
echo TTS      : http://localhost:7862/api/health
echo.

timeout /t 8 /nobreak >nul
start http://localhost:5173

echo Done! Close the 4 service windows to stop.
pause
