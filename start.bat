@echo off
title Nemos Daemon - Start
echo Starting Nemos daemon...
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    echo Run install.bat first
    pause
    exit /b 1
)
node "%NEMOS_BIN%" daemon start
if not errorlevel 1 (
    echo.
    echo Dashboard: http://localhost:3456
    timeout /t 2 >nul
    start http://localhost:3456
)
