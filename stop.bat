@echo off
title Nemos Daemon - Stop
set NEMOS_BIN=%~dp0nemos\bin\nemos.js
if exist "%NEMOS_BIN%" node "%NEMOS_BIN%" daemon stop
pause
