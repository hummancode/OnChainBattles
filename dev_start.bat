@echo off
title OnChainBattles - Dev Environment
color 0A

echo.
echo  ==========================================
echo   OnChainBattles - Starting Dev Environment
echo  ==========================================
echo.

REM ── Check Node.js ─────────────────────────────────────────────
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

REM ── Set project root (edit this path if you move the project) ──
set PROJECT_DIR=D:\OnChainBattles
cd /d "%PROJECT_DIR%"

echo [1/3] Checking .env file...
if not exist ".env" (
    echo [ERROR] .env file not found at %PROJECT_DIR%\.env
    echo        Create it with: FUJI_PRIVATE_KEY=0xyour64charkey
    pause
    exit /b 1
)
echo        .env found OK

echo.
echo [1.5/3] Clearing port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F >nul 2>nul
echo        Done.
echo [2/3] Building ^& starting Socket.io server on port 3001...
start "OCB - Socket Server" conhost cmd /k "cd /d %PROJECT_DIR% && npm run server"
ping -n 3 127.0.0.1 >nul

echo.
echo [3/3] Starting Vite dev server on port 8080...
start "OCB - Vite Dev" conhost cmd /k "cd /d %PROJECT_DIR% && npm start"
ping -n 4 127.0.0.1 >nul

echo.
echo.
echo  ==========================================
echo   All services started!
echo.
echo   Game:       http://localhost:8080
echo   Admin:      http://localhost:3001/admin
echo   Server:     http://localhost:3001
echo   Fuji Scan:  https://testnet.snowtrace.io
echo  ==========================================
echo.

REM Launch Chrome with remote debugging for DevTools MCP
echo [4/4] Launching Chrome with remote debugging (port 9222)...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\ocb-chrome-debug" http://localhost:8080 http://localhost:3001/admin

echo  Chrome opened with remote debugging on port 9222.
echo  Game:  http://localhost:8080
echo  Admin: http://localhost:3001/admin
echo.
echo  Dev environment running. Close the server windows to stop.
echo.
pause
