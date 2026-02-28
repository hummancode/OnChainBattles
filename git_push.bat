@echo off
title OnChainBattles - Auto Commit & Push
color 0B

REM ── Set your project root ─────────────────────────────────────
set PROJECT_DIR=D:\OnChainBattles
cd /d "%PROJECT_DIR%"

REM ── Get current date and time for commit message ──────────────
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do (
    set DAY=%%a
    set MONTH=%%b
    set YEAR=%%c
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set HOUR=%%a
    set MIN=%%b
)

REM ── Windows date format varies by locale - use wmic as fallback ─
for /f "skip=1 tokens=1 delims=." %%a in ('wmic os get LocalDateTime') do (
    if not defined DATETIME set DATETIME=%%a
)

REM Parse: YYYYMMDDHHMMSS
set YEAR=%DATETIME:~0,4%
set MONTH=%DATETIME:~4,2%
set DAY=%DATETIME:~6,2%
set HOUR=%DATETIME:~8,2%
set MIN=%DATETIME:~10,2%

set TIMESTAMP=%YEAR%-%MONTH%-%DAY% %HOUR%:%MIN%

echo.
echo  ==========================================
echo   OnChainBattles - Auto Commit
echo   Time: %TIMESTAMP%
echo  ==========================================
echo.

REM ── Check Git is installed ────────────────────────────────────
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git not found.
    pause
    exit /b 1
)

REM ── Check if there is anything to commit ─────────────────────
git status --porcelain > temp_status.txt
set /p STATUS=<temp_status.txt
del temp_status.txt

if "%STATUS%"=="" (
    echo  [INFO] Nothing to commit - working tree clean.
    echo.
    pause
    exit /b 0
)

REM ── Optional: let user type a short message ───────────────────
echo  Add a short note (or press ENTER to use auto message):
set /p USER_MSG="  Note: "

if "%USER_MSG%"=="" (
    set COMMIT_MSG=update: %TIMESTAMP%
) else (
    set COMMIT_MSG=%USER_MSG% [%TIMESTAMP%]
)

echo.
echo [1/3] Staging all changes...
git add .
echo        Done.

echo.
echo [2/3] Committing: "%COMMIT_MSG%"
git commit -m "%COMMIT_MSG%"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Commit failed.
    pause
    exit /b 1
)
echo        Done.

echo.
echo [3/3] Pushing to GitHub...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Push failed. Possible reasons:
    echo   - No internet connection
    echo   - Remote not set (run git_init.bat first)
    echo   - Auth issue: set up Git credential manager
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================
echo   [SUCCESS] Pushed to GitHub!
echo   Commit: %COMMIT_MSG%
echo  ==========================================
echo.
pause
