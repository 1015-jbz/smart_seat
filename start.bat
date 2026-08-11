@echo off
cd /d "%~dp0"

REM === 检测 Python 路径 ===
REM 优先使用虚拟环境，不存在则回退到系统 Python
set VENV_PY=%~dp0backend\.venv\Scripts\python.exe
if exist "%VENV_PY%" (
    set PY=%VENV_PY%
    echo [INFO] Using venv Python: %VENV_PY%
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python not found! Please install Python 3.10+ or run setup.bat
        pause
        exit /b 1
    )
    for /f "delims=" %%i in ('where python') do (
        set PY=%%i
        goto found_py
    )
    :found_py
    echo [INFO] Using system Python: %PY%
)

echo === Smart Cockpit - Starting... ===

echo [1/3] Camera + Emotion Server :7861
start "Camera-Server" "%PY%" "%~dp0backend\camera_server.py" --port 7861

echo [2/3] Backend API :8000
start "Backend-API" "%PY%" "%~dp0backend\main.py"

echo [3/3] Frontend :5173
start "Frontend" cmd /c "cd /d "%~dp0" && npm run dev"

echo.
echo === All services starting ===
echo Frontend : http://localhost:5173
echo Camera   : http://localhost:7861/video_feed
echo API docs : http://localhost:8000/docs
echo.

timeout /t 8 /nobreak >nul
start http://localhost:5173

echo Done! Close the 3 service windows to stop.
pause
