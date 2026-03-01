@echo off
setlocal

:: ==============================================================
:: STEP 5 - PLACEHOLDER PNGs via Python script file
:: ==============================================================

echo [5/5] Generating placeholder PNGs via Python + Pillow...
echo       (If you see SKIP below, run: pip install Pillow)
echo.

:: Resolve project root (defaults to current script directory)
if not defined ROOT set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "SCRIPT=%~dp0scripts_generate_placeholder_pngs.py"
if not exist "%SCRIPT%" (
  echo [ERROR] Missing script: %SCRIPT%
  pause
  exit /b 1
)

python "%SCRIPT%"
if errorlevel 1 (
  echo.
  echo [ERROR] PNG generation failed.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Project scaffold complete.
echo ============================================================
echo.

pause
endlocal