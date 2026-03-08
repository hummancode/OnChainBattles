@echo off
title OnChainBattles - Git Cleanup
color 0E

cd /d D:\OnChainBattles

echo ==========================================
echo  OnChainBattles - Git Cleanup
echo  Untrack files that should be gitignored
echo ==========================================
echo.
echo Bu script:
echo  - .gitignore'daki dosyalari Git izlemesinden cikarir
echo  - Dosyalar YEREL olarak KALIR (silinmez!)
echo  - Sadece Git artik onlari takip etmez
echo.
echo ONEMLI: Once .gitignore dosyanizi guncelleyin!
echo.

REM Git kontrolu
where git >nul 2>nul
if errorlevel 1 (
    echo Git bulunamadi! Lutfen Git yukleyin.
    pause
    exit /b 1
)

REM Kullanici onayi
echo Mevcut repo durumu:
git status -s
echo.
set /p onay="Devam etmek istiyor musunuz? (E/H): "
if /i not "%onay%"=="E" (
    echo Islem iptal edildi.
    pause
    exit /b 0
)

echo.
echo [1/6] .env dosyasi untrack ediliyor...
git rm --cached .env 2>nul
if not errorlevel 1 echo       .env basarili

echo.
echo [2/6] Generated dosyalar untrack ediliyor...
git rm --cached codebase.md 2>nul
git rm --cached src\codebase.md 2>nul
git rm --cached folder_structure.txt 2>nul
git rm --cached events.txt 2>nul

echo.
echo [3/6] .DS_Store dosyalari untrack ediliyor...
for /r %%f in (.DS_Store) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [4/6] PNG dosyalari untrack ediliyor (yerel dosyalar kalacak)...
for /r %%f in (*.png) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [5/6] Diger image dosyalari untrack ediliyor...
for /r %%f in (*.jpg *.jpeg *.gif *.webp *.svg *.ico *.bmp) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [6/6] Degisiklikler commit ediliyor...
git add .gitignore
git commit -m "chore: untrack images, .env, and generated files (now in .gitignore)"

echo.
echo ==========================================
echo  Temizlik tamamlandi!
echo ==========================================
echo.
echo Dosyalar artik Git tarafindan izlenmiyor.
echo Ama yerel olarak hala mevcut.
echo.
echo UYARI: Bu islem repo boyutunu KUCULTMEZ!
echo Eski commitlerde PNG'ler hala mevcut.
echo Repo boyutunu kucultmek icin history temizligi
echo gerekir (git_nuke_history.bat kullanin).
echo.

set /p push="Degisiklikleri push etmek ister misiniz? (E/H): "
if /i "%push%"=="E" (
    git push origin main
    if errorlevel 1 (
        echo Push basarisiz, deneyin: git push origin master
    ) else (
        echo Push basarili!
    )
)

echo.
pause
