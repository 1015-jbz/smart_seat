@echo off
cd /d "%~dp0"

set PY=%~dp0backend\.venv\Scripts\python.exe

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
