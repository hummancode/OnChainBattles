@echo off
set "output_file=folder_structure.txt"

:: Change directory to where the batch file is located
cd /d "%~dp0"

echo Generating file structure...

:: Use PowerShell to walk the directory tree, skipping unwanted folders entirely
powershell -NoProfile -Command ^
  "$excluded = @('node_modules','.git','cache','artifacts','dist','build','coverage','typechain-types','vite');                                    " ^
  "$root = Get-Location;                                                                                                                           " ^
  "function Show-Tree($path, $indent) {                                                                                                            " ^
  "  $items = Get-ChildItem -Path $path -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin $excluded } | Sort-Object Name;       " ^
  "  $count = ($items | Measure-Object).Count;                                                                                                     " ^
  "  $i = 0;                                                                                                                                       " ^
  "  foreach ($item in $items) {                                                                                                                   " ^
  "    $i++;                                                                                                                                       " ^
  "    $connector = if ($i -eq $count) { '\--' } else { '+--' };                                                                                   " ^
  "    $line = $indent + $connector + ' ' + $item.Name;                                                                                            " ^
  "    $line;                                                                                                                                      " ^
  "    if ($item.PSIsContainer) {                                                                                                                  " ^
  "      $next = if ($i -eq $count) { $indent + '    ' } else { $indent + '|   ' };                                                               " ^
  "      Show-Tree $item.FullName $next;                                                                                                           " ^
  "    }                                                                                                                                           " ^
  "  }                                                                                                                                             " ^
  "}                                                                                                                                               " ^
  "Write-Output (Split-Path $root -Leaf);                                                                                                          " ^
  "Show-Tree $root ''                                                                                                                              " > "%output_file%"

echo Structure saved to %output_file%
pause