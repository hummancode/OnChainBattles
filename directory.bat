@echo off
set "output_file=folder_structure.txt"

:: Change directory to where the batch file is located
cd /d "%~dp0"

echo Generating file structure...

:: Run the tree command
:: /f includes files, /a uses text characters instead of graphic lines for better compatibility
tree /f /a > "%output_file%"

echo Structure saved to %output_file%
pause