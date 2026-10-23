@echo off
title Nemos Plugin Installer
setlocal
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    echo Run install.bat first
    pause
    exit /b 1
)
if "%1"=="" (
    echo Installing plugins for all detected agents...
    node "%NEMOS_BIN%" plugin install
) else (
    echo Installing plugin for: %1
    node "%NEMOS_BIN%" plugin install --agent %1
)
echo.
pause
