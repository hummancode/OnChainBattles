@echo off
title OnChainBattles Commit
color 0B

cd /d D:\OnChainBattles

echo ==========================================
echo OnChainBattles - Git Commit ve Push
echo ==========================================
echo.

REM Git kontrolü
where git >nul 2>nul
if errorlevel 1 (
    echo Git bulunamadi! Lutfen Git yukleyin.
    pause
    exit /b 1
)

REM Degisiklikleri goster
echo Bekleyen degisiklikler:
git status -s
echo.

REM Kullanici onayi
set /p onay="Devam etmek istiyor musunuz? (E/H): "
if /i not "%onay%"=="E" (
    echo Islem iptal edildi.
    pause
    exit /b 0
)

REM Commit mesaji
set /p mesaj="Commit mesaji girin: "

REM Git islemleri
echo.
echo [1/2] Degisiklikler ekleniyor...
git add .

echo [2/2] Commit ve push...
git commit -m "%mesaj%"
git push origin main

if errorlevel 1 (
    echo.
    echo Push basarisiz! Alternatif olarak:
    echo git push origin master
    echo veya
    echo git push origin HEAD
) else (
    echo.
    echo Basarili! Commit: %mesaj%
)

echo.
pause