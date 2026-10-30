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
rem Resolved outside a parenthesised block: %VAR% set inside one is only read at
rem parse time, so the default would print empty.
if errorlevel 1 goto :eof
set "DASH_PORT=%NEMONS_PORT%"
if "%DASH_PORT%"=="" set "DASH_PORT=3456"
echo.
echo Dashboard: http://localhost:%DASH_PORT%
timeout /t 2 >nul
start http://localhost:%DASH_PORT%
