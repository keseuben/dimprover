@echo off
setlocal
cd /d "%~dp0"
echo.
echo DIMPRO Drive Desktop V0.1.9 - Windows Open Handler
echo DEV PILOT - PROD DENY
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dimpro-drive-desktop-open-handler-manager-v019.ps1" -Mode Install
if errorlevel 1 (
  echo.
  echo A DIMPRO Drive Desktop telepitese sikertelen.
  pause
  exit /b 1
)
echo.
echo A DIMPRO Drive Desktop telepitese sikeres.
echo A munkafajlok mappajat az elso Windows-megnyitaskor valaszthatod ki.
echo.
pause
exit /b 0
