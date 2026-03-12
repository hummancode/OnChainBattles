@echo off
echo Installing dependencies...
pip install rich pyinstaller
echo.
echo Building OCB_PatchNotes.exe...
pyinstaller --onefile --name OCB_PatchNotes --console ocb_patchnotes.py
echo.
echo Done! exe is at: dist\OCB_PatchNotes.exe
echo Data file (patch_notes.json) creates next to the exe on first run.
pause
