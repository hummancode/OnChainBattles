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
echo [2/3] Building & starting Socket.io server on port 3001...
start "OCB - Socket Server" cmd /k "cd /d %PROJECT_DIR% && npm run server"
ping -n 3 127.0.0.1 >nul

echo.
echo [3/3] Starting Vite dev server on port 8080...
start "OCB - Vite Dev" cmd /k "cd /d %PROJECT_DIR% && npm start"
ping -n 4 127.0.0.1 >nul

echo.
echo  ==========================================
echo   All services started!
echo  
echo   Game:    http://localhost:8080
echo   Socket:  http://localhost:3001
echo   Fuji:    https://testnet.snowtrace.io
echo  ==========================================
echo.
echo  USEFUL COMMANDS (run in a new terminal):
echo.
echo   Compile contract:
echo   npx hardhat compile
echo.
echo   Redeploy contract to Fuji:
echo   npx hardhat run scripts/deploy.mjs --network fuji
echo.
echo   Check Fuji contract:
echo   https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515
echo.
echo  Press any key to open the game in browser...
echo  (Chrome launches with DevTools debugging on port 9222)
pause >nul

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\ocb-chrome-debug" http://localhost:8080

echo.
echo  Dev environment running. Close the server windows to stop.
echo.
pause
