@echo off
title OnChainBattles - Reset Database
color 0E

echo.
echo  ==========================================
echo   OnChainBattles - Database Reset
echo  ==========================================
echo.
echo  This will:
echo    1. Kill all Node processes
echo    2. Delete the SQLite database
echo    3. Rebuild and restart the server (fresh DB + migrations)
echo    4. Start the Vite dev server
echo    5. Open Admin panel in browser
echo.
echo  WARNING: All player data, decks, puzzles will be lost!
echo.
pause

set PROJECT_DIR=D:\OnChainBattles
cd /d "%PROJECT_DIR%"

echo.
echo [1/5] Killing Node processes...
taskkill /F /IM node.exe >nul 2>nul
timeout /t 2 /nobreak >nul
echo       Done.

echo.
echo [2/5] Deleting database...
if exist "server\data\ocb.sqlite" (
    del /F /Q "server\data\ocb.sqlite" >nul 2>nul
    if exist "server\data\ocb.sqlite" (
        echo       ERROR: Could not delete DB. Close any SQLite browsers and try again.
        pause
        exit /b 1
    )
    echo       Database deleted.
) else (
    echo       No database found - will create fresh.
)

REM Also clean WAL/SHM files if they exist
del /F /Q "server\data\ocb.sqlite-wal" >nul 2>nul
del /F /Q "server\data\ocb.sqlite-shm" >nul 2>nul

echo.
echo [3/5] Clearing port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F >nul 2>nul
echo       Done.

echo.
echo [4/5] Building ^& starting server (fresh DB)...
start "OCB - Socket Server" cmd /k "cd /d %PROJECT_DIR% && npm run server"
timeout /t 4 /nobreak >nul

echo.
echo [5/5] Starting Vite dev server...
start "OCB - Vite Dev" cmd /k "cd /d %PROJECT_DIR% && npm start"
timeout /t 3 /nobreak >nul

echo.
echo  ==========================================
echo   Fresh environment ready!
echo.
echo   Game:       http://localhost:8080
echo   Admin:      http://localhost:3001/admin
echo   Dev Admin:  admin@admin.com / admin123
echo  ==========================================
echo.

start "" http://localhost:3001/admin

echo  Admin panel opened. Game at http://localhost:8080
echo.
pause
