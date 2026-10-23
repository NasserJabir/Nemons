@echo off
title Nemos Verify
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if not exist "%NEMOS_BIN%" (
    echo [ERROR] %NEMOS_BIN% not found
    pause
    exit /b 1
)
echo Running verification tests...
node "%NEMOS_BIN%" verify
echo.
pause
