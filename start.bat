@echo off
cd /d "%~dp0"

REM === 检测 Python 路径 ===
REM 优先使用项目根目录虚拟环境，其次 backend\.venv，最后系统 Python
set VENV_PY=%~dp0.venv\Scripts\python.exe
if exist "%VENV_PY%" (
    set PY=%VENV_PY%
    echo [INFO] Using venv Python: %VENV_PY%
) else (
    set VENV_PY=%~dp0backend\.venv\Scripts\python.exe
    if exist "%VENV_PY%" (
        set PY=%VENV_PY%
        echo [INFO] Using backend venv Python: %VENV_PY%
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
)

echo === Smart Cockpit - Starting... ===

echo [1/3] Camera + Emotion Server :7861
start "Camera-Server" "%PY%" "%~dp0backend\camera_server.py" --port 7861

echo [2/3] Backend API :8000
start "Backend-API" "%PY%" "%~dp0backend\main.py"

echo [3/3] Frontend :5173
echo [INFO] Serving pre-built dist folder...
if exist "%~dp0dist\index.html" (
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
echo.

timeout /t 8 /nobreak >nul
start http://localhost:5173

echo Done! Close the 3 service windows to stop.
pause
