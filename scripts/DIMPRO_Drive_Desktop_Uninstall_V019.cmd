@echo off
setlocal
cd /d "%~dp0"
echo.
echo DIMPRO Drive Desktop V0.1.9 eltavolitasa
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dimpro-drive-desktop-open-handler-manager-v019.ps1" -Mode Uninstall
if errorlevel 1 (
  echo.
  echo Az eltavolitas sikertelen.
  pause
  exit /b 1
)
echo.
echo A protokollkezelo eltavolitva. A felhasznaloi munkafajlok megmaradtak.
pause
exit /b 0
