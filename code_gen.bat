@echo off
echo ================================================
echo AI Digest - Codebase Documentation Generator
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check if npx is available
where npx >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npx is not available!
    echo Please make sure Node.js is properly installed.
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

REM ------------------------------------------------
REM Create .aidigestignore to exclude noise
REM ------------------------------------------------
echo Creating .aidigestignore...
(
    echo # Binary assets - useless as text in codebase.md
    echo public/assets/**/*.png
    echo public/assets/**/*.jpg
    echo public/assets/**/*.jpeg
    echo public/assets/**/*.gif
    echo public/assets/**/*.webp
    echo public/assets/**/*.svg
    echo public/assets/**/*.ico
    echo.
    echo # Compiled smart contract artifacts - massive hex/bytecode noise
    echo artifacts/**
    echo cache/**
    echo typechain-types/**
    echo ignition/deployments/**
    echo.
    echo # Phaser Editor boilerplate - not our code
    echo phasereditor2d.config.json
    echo public/assets/asset-pack.json
    echo.
    echo # Placeholder / generator scripts
    echo scripts/generate_placeholder_assets.py
    echo.
    echo # The digest file itself
    echo codebase.md
    echo context/codebase.md
    echo.
    echo # Context docs - already readable, no need to duplicate
    echo context/**
    echo.
    echo # This script itself
    echo code_gen.bat
    echo src/code_gen.bat
    echo.
    echo # Build output and deps
    echo dist/**
    echo node_modules/**
    echo.
    echo # Compiled or cached files
    echo *.js.map
    echo *.d.ts
) > .aidigestignore
echo .aidigestignore written.
echo.

REM ------------------------------------------------
REM Run ai-digest
REM ------------------------------------------------
echo Running ai-digest to generate codebase.md...
echo.

npx ai-digest

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ================================================
    echo ERROR: Failed to generate codebase.md
    echo ================================================
    echo.
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo codebase.md generated. Moving to context/...
if exist "codebase.md" (
    move /Y codebase.md context\codebase.md >nul
)

echo.
echo ================================================
echo SUCCESS! context\codebase.md is up to date.
echo ================================================
echo.

pause
