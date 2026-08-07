@echo off
cd /d "%~dp0"

echo ========================================
echo   tiaozhanbei Backend Setup
echo ========================================
echo.

REM --- Step 1: Check python on PATH ---
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found on PATH.
    echo Install Python 3.10+ from https://www.python.org/downloads/
    echo Tick "Add Python to PATH" during install.
    pause
    exit /b 1
)

REM --- Step 2: Check version >= 3.10 ---
python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
if errorlevel 1 (
    echo [ERROR] Python 3.10+ required.
    pause
    exit /b 1
)

echo [OK] Python found:
python --version
echo.

REM --- Step 3: Create data dir ---
if not exist "data" mkdir data

REM --- Step 4: Create .venv ---
if not exist ".venv\Scripts\python.exe" (
    echo Creating .venv ... please wait ...
    python -m venv .venv
)

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] .venv creation failed.
    echo Try deleting .venv folder and run setup.bat again.
    pause
    exit /b 1
)

echo [OK] .venv ready.
echo.

REM --- Step 5: Install dependencies ---
echo Installing dependencies ... first run is slow, please wait.
echo.

".venv\Scripts\python.exe" -m pip install --upgrade pip --no-cache-dir -i https://pypi.org/simple
".venv\Scripts\python.exe" -m pip install -r requirements.txt --no-cache-dir -i https://pypi.org/simple

if errorlevel 1 (
    echo.
    echo [ERROR] pip install failed.
    echo Check internet connection or antivirus.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Setup finished!
echo ========================================
echo.
echo Next step: double-click start.bat
echo.
pause
