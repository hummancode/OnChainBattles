@echo off
echo ================================================
echo AI Digest - Codebase Documentation Generator
echo ================================================
echo.

REM Check if Node.js is installed
where node nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR Node.js is not installed!
    echo Please install Node.js from httpsnodejs.org
    echo.
    pause
    exit b 1
)

REM Check if npx is available
where npx nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR npx is not available!
    echo Please make sure Node.js is properly installed.
    echo.
    pause
    exit b 1
)

echo Node.js found 
node --version
echo.

echo Running ai-digest to generate codebase.md...
echo.

REM Run ai-digest
npx ai-digest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo SUCCESS! codebase.md has been generated.
    echo ================================================
    echo.
    echo You can now find the codebase.md file in your project directory.
    echo.
) else (
    echo.
    echo ================================================
    echo ERROR Failed to generate codebase.md
    echo ================================================
    echo.
    echo Please check the error messages above.
    echo.
)

pause