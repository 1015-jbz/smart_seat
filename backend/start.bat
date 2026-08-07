@echo off
cd /d "%~dp0"

echo ========================================
echo   tiaozhanbei Backend - FastAPI
echo   starting...
echo ========================================
echo.

REM --- Check .venv exists ---
if not exist ".venv\Scripts\python.exe" goto noenv

REM --- Check deps installed ---
".venv\Scripts\python.exe" -c "import fastapi, uvicorn, sqlalchemy" 2>nul
if errorlevel 1 goto nodeps

REM --- Create data dir ---
if not exist "data" mkdir data

echo Python:
".venv\Scripts\python.exe" --version
echo.
echo Starting uvicorn on port 8000 ...
echo Swagger UI:  http://localhost:8000/docs
echo Frontend:     http://localhost:5173
echo Press Ctrl+C to stop.
echo ========================================
echo.

".venv\Scripts\python.exe" -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

echo.
echo Server stopped. Press any key to close.
pause
exit /b

:noenv
echo.
echo [ERROR] .venv not found.
echo Please run setup.bat first.
echo.
pause
exit /b

:nodeps
echo.
echo [ERROR] Dependencies missing in .venv.
echo Please run setup.bat again.
echo.
pause
exit /b
