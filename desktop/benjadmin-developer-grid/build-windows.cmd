@echo off
setlocal
title BENJADMIN Developer Grid DEV build

echo [1/3] Fuggosegek telepitese...
call npm ci
if errorlevel 1 goto :fail

echo [2/3] Acceptance teszt...
call npm run check
if errorlevel 1 goto :fail

echo [3/3] Windows portable EXE build...
call npm run dist:win
if errorlevel 1 goto :fail

echo.
echo KESZ. A build a dist mappaban talalhato.
pause
exit /b 0

:fail
echo.
echo HIBA: a build megszakadt.
pause
exit /b 1
